import { ref } from "vue";

// What the page does when the file a draft is linked to no longer matches it (docs/sync.md, "Other paths on this device").
// `conflict` becomes the Keep or Overwrite dialog (conflict.ts, useConflict.js); `problem` (file gone or unusable) only strikes through
// the header's chip. `auto` is the quiet refresh of a clean draft: only `check` (open, focus) tries it, never a save, and only when
// `can()` says nothing is being typed or saved.
interface FileStatus {
  state?: string;
  reason?: string;
  stamp?: string;
  clean?: boolean;
}

interface LinkedDraft {
  id: string;
  filePath: string;
}

interface Conflict {
  id: string;
  name: string;
  stamp: string;
  /** The draft has no edits of its own and the server also holds other text. */
  clean: boolean;
  tick: number;
  serverText?: string;
}

interface Auto {
  can(): boolean;
  run(draft: LinkedDraft, name: string): Promise<unknown>;
}

export function createFileChange(checkStatus: (id: string) => Promise<FileStatus | undefined>, auto: Auto | null = null) {
  const conflict = ref<Conflict | null>(null);
  const problem = ref<{ id: string; reason: string } | null>(null);
  let seq = 0; // a late answer for a draft that was left meanwhile must not raise anything
  let tick = 0;

  const baseName = (p: string) => p.split(/[\\/]/).pop() ?? "";

  function show(draft: LinkedDraft, s: FileStatus, extra: Partial<Conflict> = {}) {
    conflict.value = {
      id: draft.id,
      name: baseName(draft.filePath),
      stamp: s.stamp ?? "",
      clean: false,
      tick: ++tick,
      ...extra,
    };
  }

  // A gone or unusable file is a problem, anything else is not.
  function setProblem(draft: LinkedDraft, s?: FileStatus) {
    problem.value =
      s?.state === "missing"
        ? { id: draft.id, reason: "file not found" }
        : s?.state === "broken"
          ? { id: draft.id, reason: shortReason(s.reason) }
          : null;
  }

  // Raises the conflict if there is one, or has `auto` take the file's text when the draft has no edits of its own.
  async function check(draft: LinkedDraft | null | undefined, { force = false } = {}) {
    const mine = ++seq;
    if (conflict.value?.id !== draft?.id) conflict.value = null; // another draft: its dialog goes at once
    if (problem.value?.id !== draft?.id) problem.value = null;
    if (!draft?.id || !draft.filePath) {
      conflict.value = null;
      problem.value = null;
      return;
    }
    try {
      const s = await checkStatus(draft.id);
      if (mine !== seq) return;
      setProblem(draft, s);
      if (s?.state === "changed" && s.clean && !force && auto) {
        conflict.value = null;
        if (auto.can()) await auto.run(draft, baseName(draft.filePath));
        return;
      }
      if (s?.state !== "changed") {
        conflict.value = null; // nothing to answer (any more)
        return;
      }
      if (conflict.value && conflict.value.id === draft.id && conflict.value.stamp === (s.stamp ?? "") && !conflict.value.clean) return; // already showing
      show(draft, s, s.clean ? { clean: true } : {});
    } catch {
      // The file cannot be looked at (the database is unavailable, say): saving reports that when it matters.
    }
  }

  // A save was refused because the file changed; without details (the web build) a plain conflict is shown.
  async function raise(draft: LinkedDraft | null | undefined) {
    const mine = ++seq;
    if (!draft?.id || !draft.filePath) return;
    let s: FileStatus = { state: "changed" };
    try {
      const got = await checkStatus(draft.id);
      if (got?.state === "changed" || got?.state === "missing" || got?.state === "broken") s = got;
    } catch {
      // keep the plain conflict
    }
    if (mine !== seq) return;
    setProblem(draft, s);
    if (s.state === "changed") show(draft, s);
  }

  // Clean draft, changed file, and the server holds other text: the file's text is "yours".
  function raiseClean(draft: LinkedDraft, { stamp, serverText }: { stamp: string; serverText: string }) {
    seq++;
    show(draft, { stamp }, { clean: true, serverText });
  }

  // The link stays, so the next Ctrl+S or look tries again.
  function failed(draft: LinkedDraft | null | undefined, message: unknown) {
    seq++;
    conflict.value = null;
    if (draft?.id && draft.filePath) problem.value = { id: draft.id, reason: shortReason(message) };
  }

  // Written, replaced or unlinked: nothing pending, nothing wrong.
  function clear() {
    seq++;
    conflict.value = null;
    problem.value = null;
  }

  // Answered; the chip may still have a problem to show.
  function clearConflict() {
    seq++;
    conflict.value = null;
  }

  return { conflict, problem, check, raise, raiseClean, failed, clear, clearConflict };
}

// "could not write /a/b.md: permission denied" becomes "permission denied".
export function shortReason(text: unknown): string {
  const t = String(text ?? "")
    .trim()
    .replace(/^Not saved to a file: /, "");
  const last = (t.split(": ").pop() ?? "").replace(/^it is /, "").replace(/^open .*?: /, "");
  const out = last.replace(/\.$/, "");
  return out ? out[0].toLowerCase() + out.slice(1) : "file not usable";
}
