// Runs Harper in a Web Worker, instead of harper.js's WorkerLinter (why: docs/architecture.md, "Frontend").
// In: { id, method, args }. Out: { id, result } or { id, error }.
import { LocalLinter } from "harper.js";
import { slimBinary } from "harper.js/slimBinary";
import { harperMethods } from "./harperCore.ts";

const methods = harperMethods(new LocalLinter({ binary: slimBinary }));

type Method = keyof typeof methods;

self.onmessage = async ({ data: { id, method, args } }: MessageEvent<{ id: number; method: Method; args: unknown[] }>) => {
  try {
    self.postMessage({ id, result: await (methods[method] as (...a: unknown[]) => unknown)(...args) });
  } catch (err) {
    self.postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
};
