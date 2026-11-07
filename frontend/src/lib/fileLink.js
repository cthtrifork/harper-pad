// Which controls the header offers for a draft's file link (docs/sync.md, "Other paths on this device"). Desktop only: the web build never
// unlinks, so it always offers Save to disk. A linked draft, struck through or not, has no Save to disk until it is unlinked.
export const UNLINK_FIRST = "Unlink first to save as another file";

// `canUnlink` is false on the web, where a file is only a picker handle. `showDirty` is the dot: the draft has changes the file does not have
// yet (`fileState` "stale"); never with a struck-through chip, without a link, or on the web.
export function fileControls({ filePath, fileProblem, canUnlink, fileState }) {
  const linked = !!filePath && canUnlink;
  return {
    showSaveAs: !linked,
    showChipX: linked,
    showDirty: linked && !fileProblem && fileState === "stale",
  };
}

// The words for the dot, for its title and for screen readers.
export const dirtyText = (name) => `Your draft has changes not yet in ${name}. Ctrl+S updates it.`;

// What Ctrl+Shift+S (or the Save to disk button) does: "ask" for a file, or "hint" that the link must go first.
export function saveAsAction(state) {
  return fileControls(state).showSaveAs ? "ask" : "hint";
}
