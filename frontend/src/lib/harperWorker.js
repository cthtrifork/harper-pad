// Runs Harper in a Web Worker. harper.js's own WorkerLinter also builds a serializer on the page's main thread, which fetches and
// compiles the 20 MB wasm a second time there; the page never needs it, because findings leave this worker as plain objects (see
// harperCore.js). Messages in: { id, method, args }. Messages out: { id, result } or { id, error }.
import { LocalLinter } from "harper.js";
import { slimBinary } from "harper.js/slimBinary";
import { harperMethods } from "./harperCore.js";

const methods = harperMethods(new LocalLinter({ binary: slimBinary }));

self.onmessage = async ({ data: { id, method, args } }) => {
  try {
    self.postMessage({ id, result: await methods[method](...args) });
  } catch (err) {
    self.postMessage({ id, error: String(err?.message ?? err) });
  }
};
