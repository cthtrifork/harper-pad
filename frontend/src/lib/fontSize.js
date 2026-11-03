// The text size: a few steps rather than a slider, kept in the browser storage the webview already has (like the autocorrect choices).
// There are two, "editor" and "preview". The page reads each from a CSS property (--editor-size in px, and --editor-scale, the same as
// a plain number next to 19) so the editor, the Split source and the Split preview scale together from the editor's size, while the
// full Preview view has its own.
export const SIZES = [16, 19, 22, 26];
export const DEFAULT_SIZE = 19;
const key = (which) => `harper-pad.${which}-size`;

export function loadSize(which = "editor", storage = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(key(which)));
    if (SIZES.includes(n)) return n;
  } catch {
    // blocked storage: use the default
  }
  return DEFAULT_SIZE;
}

export function saveSize(which, size, storage = globalThis.localStorage) {
  try {
    if (size === DEFAULT_SIZE) storage?.removeItem(key(which));
    else storage?.setItem(key(which), String(size));
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

export function applySize(which, size, root = globalThis.document?.documentElement) {
  root?.style.setProperty(`--${which}-size`, `${size}px`);
  root?.style.setProperty(`--${which}-scale`, String(size / DEFAULT_SIZE));
}
