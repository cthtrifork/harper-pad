// Which controls the header offers for a draft's file link (desktop; the web build never unlinks, so it always offers Save to disk).
//   no link          Save to disk, no chip.
//   link, healthy    the file chip with its x (Unlink); no Save to disk; Ctrl+Shift+S only says "Unlink first to save as another file".
//   link, struck     the struck chip with its x, and Save to disk beside it, so picking another path is one step.
export const UNLINK_FIRST = "Unlink first to save as another file";

// `canUnlink` is false on the web, where a file is only a picker handle.
//
// A small dot beside a healthy file name says your draft has changes the file does not have yet (`fileState` "stale": typing since the file was
// last Updated, or a changed draft from the server). It goes when Ctrl+S or Save Updates the file. None while the chip is struck through (the
// problem wins), none without a link, none on the web.
export function fileControls({ filePath, fileProblem, canUnlink, fileState }) {
  const linked = !!filePath && canUnlink;
  return {
    showSaveAs: !linked || !!fileProblem,
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
