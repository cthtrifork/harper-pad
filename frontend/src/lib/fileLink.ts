// Which header controls a draft's file link offers (docs/sync.md, "Other paths on this device"). A linked draft has no Save to disk until
// it is unlinked.
export const UNLINK_FIRST = "Unlink first to save as another file";

// `canUnlink` is false on the web, where a file is only a picker handle. `showDirty` is the dot: the file is "stale", never with a
// struck-through chip.
interface FileLinkState {
  filePath?: string;
  fileProblem?: unknown;
  canUnlink: boolean;
  fileState?: string;
}

export function fileControls({ filePath, fileProblem, canUnlink, fileState }: FileLinkState) {
  const linked = !!filePath && canUnlink;
  return {
    showSaveAs: !linked,
    showChipX: linked,
    showDirty: linked && !fileProblem && fileState === "stale",
  };
}

// The dot's title and screen reader text.
export const dirtyText = (name: string) => `Your draft has changes not yet in ${name}. Ctrl+S updates it.`;

// Ctrl+Shift+S and the Save to disk button: "hint" that the link must go first, else "ask".
export function saveAsAction(state: FileLinkState): "ask" | "hint" {
  return fileControls(state).showSaveAs ? "ask" : "hint";
}
