// A few steps rather than a slider. "editor" and "preview" are separate; the Split view scales both from the editor's size.
import { scoped } from "./scope.ts";

export const SIZES = [16, 19, 22, 26];
export const DEFAULT_SIZE = 19;
type Which = "editor" | "preview";

const key = (which: Which) => scoped(`harper-pad.${which}-size`);

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadSize(which: Which = "editor", storage: Store = globalThis.localStorage) {
  try {
    const n = Number(storage?.getItem(key(which)));
    if (SIZES.includes(n)) return n;
  } catch {
    // blocked storage: use the default
  }
  return DEFAULT_SIZE;
}

export function saveSize(which: Which, size: number, storage: Store = globalThis.localStorage) {
  try {
    if (size === DEFAULT_SIZE) storage?.removeItem(key(which));
    else storage?.setItem(key(which), String(size));
  } catch {
    // the choice then only lasts until the window closes
  }
}

// Stops at the ends; 0 goes back to the default.
export function stepSize(size: number, dir: -1 | 0 | 1) {
  if (dir === 0) return DEFAULT_SIZE;
  const i = SIZES.indexOf(size);
  const from = i < 0 ? SIZES.indexOf(DEFAULT_SIZE) : i;
  return SIZES[Math.min(SIZES.length - 1, Math.max(0, from + dir))];
}

export function applySize(which: Which, size: number, root: HTMLElement | undefined = globalThis.document?.documentElement) {
  root?.style.setProperty(`--${which}-size`, `${size}px`);
  root?.style.setProperty(`--${which}-scale`, String(size / DEFAULT_SIZE));
}
