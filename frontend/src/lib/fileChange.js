import { ref } from "vue";

// What the page does when the file a draft is linked to no longer matches the draft: it looks (`checkStatus(id)` is the Go side's
// LinkedFileStatus, which reads the stored path; the web build has no path and always answers "none").
//
//   conflict  null or {id, name, stamp, counts, clean, serverText}: the file's text differs from the draft and the draft has edits of its own
//             (a real conflict), or the draft has none and the server also holds something else (`clean`, `serverText`). It becomes the one
//             Keep or Overwrite dialog (lib/conflict.js, useConflict.js); it stays until the person chooses, and is never hidden.
//   problem   {id, reason} when the file is gone or cannot be used (deleted, moved, folder or drive gone, permission denied, now a folder,
//             binary, not UTF-8, over 1 MiB): the header's chip is struck through. No dialog. Ctrl+S writes a gone file again, and a file
//             that exists but is not text is never overwritten (Go refuses; the chip says so).
//
// `auto` ({can(), run(draft, name)}) is the quiet path: a file whose text differs while the draft has no edits of its own (`clean`) is not a
// conflict with the file, so `run` takes the file's text. It is tried only by `check` (open, focus), never by a save, and only when `can()`
// says nothing is being typed or saved; if it cannot run now the next check tries again.
export function createFileChange(checkStatus, auto = null) {
  const conflict = ref(null);
  const problem = ref(null);
  let seq = 0; // a late answer for a draft that was left meanwhile must not raise anything
  let tick = 0;

  const baseName = (p) => p.split(/[\\/]/).pop();

  function show(draft, s, extra = {}) {
    conflict.value = {
      id: draft.id,
      name: baseName(draft.filePath),
      stamp: s.stamp ?? "",
      counts: s.fileLines != null ? s : null,
      clean: false,
      tick: ++tick,
      ...extra,
    };
  }

  // What the status says about the chip: a gone or unusable file is a problem, anything else is not.
  function setProblem(draft, s) {
    problem.value =
      s?.state === "missing"
        ? { id: draft.id, reason: "file not found" }
        : s?.state === "broken"
          ? { id: draft.id, reason: shortReason(s.reason) }
          : null;
  }

  // Looks at the file of `draft` ({id, filePath}); raises the conflict if there is one, or takes the file's text when the draft has no edits of
  // its own (`auto`).
  async function check(draft, { force = false } = {}) {
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

  // A save was refused because the file changed. The details are looked up; if they cannot be (the web build), a plain conflict is shown.
  async function raise(draft) {
    const mine = ++seq;
    if (!draft?.id || !draft.filePath) return;
    let s = { state: "changed" };
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

  // The draft has no edits of its own, the file changed, and the server also holds other text: the dialog, with the file's text as "yours".
  function raiseClean(draft, { stamp, serverText }) {
    seq++;
    show(draft, { stamp }, { clean: true, serverText });
  }

  // Writing the file failed (or it is not there to look at): the chip says why. The link stays, so the next Ctrl+S or look tries again.
  function failed(draft, message) {
    seq++;
    conflict.value = null;
    if (draft?.id && draft.filePath) problem.value = { id: draft.id, reason: shortReason(message) };
  }

  // The file was just written, replaced or unlinked: nothing is pending and nothing is wrong.
  function clear() {
    seq++;
    conflict.value = null;
    problem.value = null;
  }

  // The dialog was answered (the file side is settled), but the chip may still have a problem to show.
  function clearConflict() {
    seq++;
    conflict.value = null;
  }

  return { conflict, problem, check, raise, raiseClean, failed, clear, clearConflict };
}

// A short reason for the chip from an error or a reason: "could not write /a/b.md: permission denied" becomes "permission denied".
export function shortReason(text) {
  const t = String(text ?? "")
    .trim()
    .replace(/^Not saved to a file: /, "");
  const last = t
    .split(": ")
    .pop()
    .replace(/^it is /, "")
    .replace(/^open .*?: /, "");
  const out = last.replace(/\.$/, "");
  return out ? out[0].toLowerCase() + out.slice(1) : "file not usable";
}
