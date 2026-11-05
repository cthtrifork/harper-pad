// Harper runs in its own Web Worker (harperWorker.js); this is the page's handle on it. The wasm is a separate hashed asset the worker
// fetches at runtime (needs application/wasm from the asset server); it works in WebKitGTK. Every method is a message to the worker and
// returns a promise; `dispose` ends the worker.
export const createLinter = () => connect(new Worker(new URL("./harperWorker.js", import.meta.url), { type: "module" }));

// The handle on a worker that speaks harperWorker.js's messages (a parameter so the tests can stand in a fake one).
export async function connect(worker) {
  const pending = new Map();
  let next = 1;
  const fail = (err) => {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  };
  worker.onmessage = ({ data: { id, result, error } }) => {
    const call = pending.get(id);
    pending.delete(id);
    if (error !== undefined) call?.reject(new Error(error));
    else call?.resolve(result);
  };
  worker.onerror = (e) => fail(new Error(e.message || "The Harper worker failed"));
  const call = (method, ...args) =>
    new Promise((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, method, args });
    });
  const linter = {
    lintPlain: (text) => call("lintPlain", text),
    importWords: (words) => call("importWords", words),
    exportWords: () => call("exportWords"),
    ignoreLintHash: (hash) => call("ignoreLintHash", hash),
    exportIgnoredLints: () => call("exportIgnoredLints"),
    importIgnoredLints: (json) => call("importIgnoredLints", json),
    clearIgnoredLints: () => call("clearIgnoredLints"),
    async dispose() {
      fail(new Error("The linter was disposed"));
      worker.terminate();
    },
  };
  await call("setup");
  return linter;
}

// Lint the text and return plain findings (see harperWorker.js).
export const lintText = (linter, text) => linter.lintPlain(text);
