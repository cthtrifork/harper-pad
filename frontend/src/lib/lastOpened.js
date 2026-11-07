// The draft that was open last, kept in browser storage of this device only (never synced), so a reload or relaunch shows the same draft.
// Without one, or when it no longer exists, the start-up falls back to the most recently changed draft.
import { scoped } from "./scope.ts";

const key = () => scoped("harper-pad.last-opened");
const ID = /^[0-9a-f]{32}$/;

export function loadLastOpened(storage = globalThis.localStorage) {
  try {
    const id = storage?.getItem(key());
    return ID.test(id ?? "") ? id : "";
  } catch {
    return ""; // blocked storage: no memory
  }
}

export function saveLastOpened(id, storage = globalThis.localStorage) {
  try {
    if (ID.test(id ?? "")) storage?.setItem(key(), id);
    else storage?.removeItem(key());
  } catch {
    // the choice then only lasts until the window closes
  }
}

// Wraps a startup answer ({open, ...}, `open` being the most recently changed draft): when the last opened draft is another one that still
// exists, opens that instead. `getDraft` rejects for a missing draft, which keeps the fallback.
export async function withLastOpened(start, getDraft, storage = globalThis.localStorage) {
  const id = loadLastOpened(storage);
  if (!id || !start.open || start.open.id === id) return start;
  try {
    const d = await getDraft(id);
    return d?.id === id ? { ...start, open: d } : start;
  } catch {
    return start;
  }
}
