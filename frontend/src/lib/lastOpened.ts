// The draft open last, in this device's storage only (never synced), so a reload shows the same draft; else the most recently changed.
import { scoped } from "./scope.ts";

const key = () => scoped("harper-pad.last-opened");
const ID = /^[0-9a-f]{32}$/;

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadLastOpened(storage: Store = globalThis.localStorage): string {
  try {
    const id = storage?.getItem(key());
    return id && ID.test(id) ? id : "";
  } catch {
    return ""; // blocked storage: no memory
  }
}

export function saveLastOpened(id: string | null | undefined, storage: Store = globalThis.localStorage) {
  try {
    if (id && ID.test(id)) storage?.setItem(key(), id);
    else storage?.removeItem(key());
  } catch {
    // the choice then only lasts until the window closes
  }
}

// `getDraft` rejects for a missing draft, which keeps the fallback.
export async function withLastOpened<D extends { id: string }, S extends { open: D | null }>(
  start: S,
  getDraft: (id: string) => Promise<D | undefined>,
  storage: Store = globalThis.localStorage,
): Promise<S> {
  const id = loadLastOpened(storage);
  if (!id || !start.open || start.open.id === id) return start;
  try {
    const d = await getDraft(id);
    return d?.id === id ? { ...start, open: d } : start;
  } catch {
    return start;
  }
}
