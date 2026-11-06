// Which controls the header offers for a draft's file link (desktop; the web build never unlinks, so it always offers Save as file).
//   no link          Save as file, no chip.
//   link, healthy    the file chip with its x (Unlink); no Save as file; Ctrl+Shift+S only says "Unlink first to save as another file".
//   link, struck     the struck chip with its x, and Save as file beside it, so picking another path is one step.
export const UNLINK_FIRST = "Unlink first to save as another file";

// `canUnlink` is false on the web, where a file is only a picker handle.
export function fileControls({ filePath, fileProblem, canUnlink }) {
  const linked = !!filePath && canUnlink;
  return {
    showSaveAs: !linked || !!fileProblem,
    showChipX: linked,
  };
}

// What Ctrl+Shift+S (or the Save as file button) does: "ask" for a file, or "hint" that the link must go first.
export function saveAsAction(state) {
  return fileControls(state).showSaveAs ? "ask" : "hint";
}
