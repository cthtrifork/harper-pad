// Registers the service worker (web build) and tells the page when a new version is waiting, so it can offer a Reload instead of
// swapping the code under an open editor. The worker (web/sw.js) installs the new version but waits; `applyUpdate` tells it to take
// over and the page reloads once it has. A first install has no controller yet and is not an update, so nothing is offered then.
// An installed iPhone app is rarely reloaded, so the page also asks the server for a new worker whenever it comes back to the front,
// at most once an hour.
const CHECK_EVERY_MS = 60 * 60 * 1000;

let listeners = [];
let registration = null;

// Calls `fn` when a new version is waiting (again, each time it is noticed while still waiting).
export const onUpdateReady = (fn) => listeners.push(fn);
const notify = () => {
  for (const fn of listeners) fn();
};

// `sw` is navigator.serviceWorker, `doc` the document, `reload` what to do once the new worker is in charge.
export async function registerWorker(
  url,
  { sw = globalThis.navigator?.serviceWorker, doc = globalThis.document, reload = () => location.reload(), now = Date.now } = {},
) {
  if (!sw) return;
  const waitingIsUpdate = (reg) => reg.waiting && sw.controller;
  registration = await sw.register(url).catch(() => null);
  if (!registration) return;
  const reg = registration;
  if (waitingIsUpdate(reg)) notify();
  reg.addEventListener("updatefound", () => {
    const worker = reg.installing;
    worker?.addEventListener("statechange", () => {
      if (worker.state === "installed" && sw.controller) notify();
    });
  });
  let last = now();
  doc.addEventListener("visibilitychange", () => {
    if (doc.visibilityState !== "visible" || now() - last < CHECK_EVERY_MS) return;
    last = now();
    reg.update().catch(() => {});
    if (waitingIsUpdate(reg)) notify();
  });
  applyUpdate.reload = reload;
  applyUpdate.sw = sw;
}

// Lets the waiting worker take over and reloads the page when it has. Save what is typed before calling this.
export function applyUpdate() {
  const { sw, reload } = applyUpdate;
  if (!registration?.waiting || !sw) return reload?.();
  let done = false;
  sw.addEventListener("controllerchange", () => {
    if (done) return;
    done = true;
    reload();
  });
  registration.waiting.postMessage({ type: "skip-waiting" });
}

// For tests: forget the registration and the listeners.
export function resetForTests() {
  listeners = [];
  registration = null;
  applyUpdate.sw = undefined;
  applyUpdate.reload = undefined;
}
