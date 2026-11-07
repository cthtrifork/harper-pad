// The page's handle on the Harper worker (docs/architecture.md, "Frontend"): every method is a message, and `dispose` ends the worker.
// The worker fetches the wasm as a separate hashed asset, so the asset server must send application/wasm.
import type { Finding } from "./harperCore.ts";

export interface HarperLinter {
  lintPlain(text: string): Promise<Finding[]>;
  importWords(words: string[]): Promise<void>;
  exportWords(): Promise<string[]>;
  ignoreLintHash(hash: bigint): Promise<void>;
  exportIgnoredLints(): Promise<string>;
  importIgnoredLints(json: string): Promise<void>;
  clearIgnoredLints(): Promise<void>;
  dispose(): Promise<void>;
}

interface WorkerLike {
  onmessage: ((e: { data: { id: number; result?: unknown; error?: string } }) => void) | null;
  onerror: ((e: { message?: string }) => void) | null;
  postMessage(message: unknown): void;
  terminate(): void;
}

export const createLinter = () => connect(new Worker(new URL("./harperWorker.ts", import.meta.url), { type: "module" }));

// `worker` is a parameter so the tests can stand in a fake one.
export async function connect(worker: WorkerLike | Worker): Promise<HarperLinter> {
  const w = worker as WorkerLike;
  const pending = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>();
  let next = 1;
  const fail = (err: Error) => {
    for (const { reject } of pending.values()) reject(err);
    pending.clear();
  };
  w.onmessage = ({ data: { id, result, error } }) => {
    const call = pending.get(id);
    pending.delete(id);
    if (error !== undefined) call?.reject(new Error(error));
    else call?.resolve(result as never);
  };
  w.onerror = (e) => fail(new Error(e.message || "The Harper worker failed"));
  const call = <T>(method: string, ...args: unknown[]) =>
    new Promise<T>((resolve, reject) => {
      const id = next++;
      pending.set(id, { resolve, reject });
      w.postMessage({ id, method, args });
    });
  const linter: HarperLinter = {
    lintPlain: (text) => call("lintPlain", text),
    importWords: (words) => call("importWords", words),
    exportWords: () => call("exportWords"),
    ignoreLintHash: (hash) => call("ignoreLintHash", hash),
    exportIgnoredLints: () => call("exportIgnoredLints"),
    importIgnoredLints: (json) => call("importIgnoredLints", json),
    clearIgnoredLints: () => call("clearIgnoredLints"),
    async dispose() {
      fail(new Error("The linter was disposed"));
      w.terminate();
    },
  };
  await call("setup");
  return linter;
}

export const lintText = (linter: HarperLinter, text: string) => linter.lintPlain(text);
