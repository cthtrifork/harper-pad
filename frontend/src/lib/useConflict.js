import { ref, watch } from "vue";
import { resolveConflict } from "./conflict.js";

// The Keep or Overwrite dialog for the open draft (ConflictDialog.vue): what disagrees with it (its file, the server, or both), the model for
// lib/conflict.js, and the choice. `drafts` is useDrafts and `sync` is useSync. Only the open draft ever gets a dialog; any other draft in
// conflict is left exactly as it is until it is opened.
export function useConflict({ drafts, sync }) {
  const model = ref(null); // {id, name, yours, file, server, applyFile} while the dialog shows
  const busy = ref(false);
  const note = ref(""); // a line under the buttons: "Something changed, look again"
  const result = ref(null); // {copies, fileError} after the last choice, for the toast
  let building = 0;

  const syncOn = () => sync.enrolled.value;

  async function build() {
    const mine = ++building;
    const id = drafts.current.value.id;
    const f = drafts.fileConflict.value?.id === id ? drafts.fileConflict.value : null;
    let sv = sync.serverConflict.value?.id === id ? sync.serverConflict.value : null;
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
    let file = null;
    let server = null;
    try {
      if (f) {
        const t = await drafts.dialog.fileText();
        file = { text: t.text, stamp: t.stamp };
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
    if (sv) server = { text: sv.text, stamp: sv.stamp };
    if (mine !== building) return;
    const yours = f?.clean ? file.text : drafts.dialog.current().text;
    model.value = { id, name: f?.name ?? "", yours, file, server, applyFile: !!f?.clean, sync: syncOn() };
  }

  watch([() => drafts.fileConflict.value, () => sync.serverConflict.value, () => drafts.current.value.id], build, { immediate: true });

  const ops = (m) => ({
    async recheck() {
      const id = m.id;
      const file = m.file ? { stamp: await drafts.dialog.fileStamp() } : null;
      let server = null;
      if (m.server) {
        const s = await sync.inspectServer(id);
        server = s === false ? { stamp: m.server.stamp } : s ? { stamp: s.stamp } : { stamp: "" }; // could not look: assume unchanged
      }
      return { file: file?.stamp == null && m.file ? { stamp: "gone" } : file, server };
    },
    applyFile: () => drafts.dialog.applyFile(),
    saveCopy: (text, from) => drafts.dialog.saveCopy(text, from),
    writeFile: drafts.current.value.filePath ? () => drafts.dialog.writeFile() : null,
    push: syncOn() ? () => sync.forcePush(m.id) : null,
  });

  // The person chose. Both sides are looked at again first; if either moved, the dialog is redrawn and nothing is written.
  async function choose(choice) {
    const m = model.value;
    if (!m || busy.value) return;
    busy.value = true;
    note.value = "";
    try {
      const r = await resolveConflict(choice, m, ops(m));
      if (r.status === "stale") {
        note.value = "Something changed while this was open. Please look again.";
        await drafts.recheckFile();
        await build();
        return;
      }
      result.value = { copies: r.copies, fileError: r.fileError, pushed: r.pushed };
      drafts.clearFileConflict();
      sync.clearConflict();
      model.value = null;
    } catch (err) {
      note.value = `Could not finish: ${String(err?.message || err)}`;
    } finally {
      busy.value = false;
    }
  }

  return { model, busy, note, result, choose };
}
