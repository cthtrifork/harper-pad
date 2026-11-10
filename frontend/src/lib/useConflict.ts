import { ref, watch } from "vue";
import { type Choice, type ConflictModel, type ConflictOps, type Origin, resolveConflict, staleNote } from "./conflict.ts";
import { isProtected } from "./protectedDrafts.ts";
import type { useDrafts } from "./useDrafts.ts";
import type { useSync } from "./useSync.ts";

type DraftsApi = Pick<
  ReturnType<typeof useDrafts>,
  "current" | "fileConflict" | "dialog" | "recheckFile" | "clearFileConflict" | "locked" | "protectedDraft" | "flush" | "state"
>;

type SyncApi = Pick<
  ReturnType<typeof useSync>,
  "enrolled" | "serverConflict" | "checkNow" | "inspectServer" | "forcePush" | "clearConflict"
>;

// The Keep or Overwrite dialog for the open draft (ConflictDialog.vue): the model for lib/conflict.ts, and the choice. Only the open draft
// ever gets a dialog; any other draft in conflict is left exactly as it is until it is opened.
export function useConflict({ drafts, sync }: { drafts: DraftsApi; sync: SyncApi }) {
  const model = ref<ConflictModel | null>(null); // while the dialog shows
  const busy = ref(false);
  const note = ref(""); // a line under the buttons: "Something changed, look again"
  const result = ref<{ copies: { id: string; from: Origin }[]; fileError: string; pushed: boolean | null } | null>(null); // for the toast
  let building = 0;

  const syncOn = () => sync.enrolled.value;

  async function build() {
    const mine = ++building;
    const id = drafts.current.value.id;
    const f = drafts.fileConflict.value?.id === id ? drafts.fileConflict.value : null;
    let sv: { text: string; format: string; stamp: string; updatedAt: number } | null =
      sync.serverConflict.value?.id === id ? sync.serverConflict.value : null;
    if (!f && !sv) {
      model.value = null;
      return;
    }
    // A conflict with the file alone: look at the server too, so a draft that conflicts with both gets one dialog covering both.
    if (f && !sv && !f.clean && syncOn()) {
      await sync.checkNow(id);
      if (mine !== building) return;
      sv = sync.serverConflict.value?.id === id ? sync.serverConflict.value : null;
    }
    if (sv) {
      const latest = await sync.inspectServer(id);
      if (mine !== building) return;
      if (latest === null) sv = null;
      else if (latest) sv = latest;
    }
    if (drafts.locked.value) {
      model.value = null; // Keep needs the key to seal the copy under its new id. Ask after unlocking.
      return;
    }
    let file: ConflictModel["file"] = null;
    let server: ConflictModel["server"] = null;
    try {
      if (f) {
        const t = await drafts.dialog.fileText();
        file = { text: t.text, stamp: t.stamp, at: Math.floor(Number(t.stamp) / 1e6) }; // the stamp is the modified time in ns
      }
      if (f?.clean && !sv) {
        const got = await sync.inspectServer(id); // the draft has no edits of its own and the server holds other text
        if (got) sv = got;
      }
    } catch {
      // The file cannot be read as text: it is a chip problem, not a conflict (useDrafts shows that).
      if (mine === building) model.value = null;
      return;
    }
    if (sv) server = { text: sv.text, stamp: sv.stamp, at: sv.updatedAt };
    if (mine !== building) return;
    const yours = f?.clean ? (file as { text: string }).text : drafts.dialog.current().text;
    // An unedited draft takes the file's text. If the server then holds nothing or the same text, nothing differs after all: no dialog.
    if (f?.clean && (!server || server.text === yours)) {
      model.value = null;
      return;
    }
    model.value = {
      id,
      name: f?.name ?? "",
      yours,
      file,
      server,
      applyFile: !!f?.clean,
      sync: syncOn(),
      protected: drafts.protectedDraft?.value || (!!sv && isProtected(sv.text)),
      draftAt: drafts.dialog.current().updatedAt,
    };
  }

  watch(
    [() => drafts.fileConflict.value, () => sync.serverConflict.value, () => drafts.current.value.id, () => drafts.locked.value],
    build,
    { immediate: true },
  );

  const ops = (m: ConflictModel): ConflictOps => ({
    async recheck() {
      const id = m.id as string;
      const file = m.file ? { stamp: await drafts.dialog.fileStamp() } : null;
      let server: { stamp: string } | null = null;
      if (m.server) {
        const s = await sync.inspectServer(id);
        server = s === false ? { stamp: m.server.stamp } : s ? { stamp: s.stamp } : { stamp: "" }; // could not look: assume unchanged
      }
      return { file: file?.stamp == null && m.file ? { stamp: "gone" } : (file as { stamp: string } | null), server };
    },
    applyFile: () => drafts.dialog.applyFile(),
    saveCopy: (text: string, from: Origin) => drafts.dialog.saveCopy(text, from),
    writeFile: drafts.current.value.filePath ? () => drafts.dialog.writeFile() : null,
    push: syncOn() ? () => sync.forcePush(m.id as string) : null,
  });

  // The person chose. Both sides are looked at again first; if either moved, the dialog is redrawn and nothing is written.
  async function choose(choice: Choice) {
    const m = model.value;
    if (!m || busy.value) return;
    busy.value = true;
    note.value = "";
    try {
      await drafts.flush();
      if (["dirty", "saving", "error"].includes(drafts.state.value))
        throw new Error("This draft could not be saved. Check it and choose again.");
      const current = drafts.dialog.current();
      if (drafts.locked.value || current.id !== m.id || current.updatedAt !== m.draftAt) {
        note.value = "This draft changed meanwhile. Check the rows and choose again.";
        await build();
        return;
      }
      const r = await resolveConflict(choice, m, ops(m));
      if (r.status === "stale") {
        note.value = staleNote(m, r.changed);
        await drafts.recheckFile();
        await build();
        return;
      }
      result.value = { copies: r.copies, fileError: r.fileError, pushed: r.pushed };
      drafts.clearFileConflict();
      sync.clearConflict();
      model.value = null;
    } catch (err) {
      const e = err as Error & { untouched?: boolean };
      note.value = `Could not finish: ${String(e?.message || err).replace(/\.$/, "")}.${e?.untouched ? " Nothing was changed." : ""}`;
    } finally {
      busy.value = false;
    }
  }

  return { model, busy, note, result, choose };
}
