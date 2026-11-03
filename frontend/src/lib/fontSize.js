// The editor's text size: a few steps rather than a slider, kept in the browser storage the webview already has (like the autocorrect
// choices). The page reads it from the --editor-size property, so the editor, the Split source and the preview body scale together.
export const SIZES = [16, 19, 22, 26];
export const DEFAULT_SIZE = 19;
const KEY = "harper-pad.editor-size";

export function loadSize(storage = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(KEY));
    if (SIZES.includes(n)) return n;
  } catch {
    // blocked storage: use the default
  }
  return DEFAULT_SIZE;
}

export function saveSize(size, storage = globalThis.localStorage) {
  try {
    if (size === DEFAULT_SIZE) storage?.removeItem(KEY);
    else storage?.setItem(KEY, String(size));
  } catch {
    // the choice then only lasts until the window closes
  }
}

// One step up (+1) or down (-1), stopping at the ends; 0 goes back to the default.
export function stepSize(size, dir) {
  if (dir === 0) return DEFAULT_SIZE;
  const i = SIZES.indexOf(size);
  const from = i < 0 ? SIZES.indexOf(DEFAULT_SIZE) : i;
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, from + dir))];
}

export function applySize(size, root = globalThis.document?.documentElement) {
  root?.style.setProperty("--editor-size", `${size}px`);
}
