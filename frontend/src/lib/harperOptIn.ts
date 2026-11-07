import { scoped } from "./scope.ts";

const KEY = scoped("harper-pad.harper-on");

// On a phone Harper's 20 MB wasm is opt-in: it loads only once the person asks for it (the "?" on the Problems button), and then on
// every start, so the choice is kept in the browser storage the webview already has. Storage can be unavailable (private window, blocked
// storage), so every access is guarded: the choice then only lasts until the page closes.
export function loadOptIn(storage: Pick<Storage, "getItem"> = globalThis.localStorage) {
  try {
    return storage?.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function saveOptIn(on: boolean, storage: Pick<Storage, "setItem" | "removeItem"> = globalThis.localStorage) {
  try {
    if (on) storage?.setItem(KEY, "1");
    else storage?.removeItem(KEY);
  } catch {
    // blocked storage: the choice lasts until the page closes
  }
}
