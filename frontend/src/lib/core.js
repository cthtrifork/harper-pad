// The Go logic shared with the desktop app (internal/core), compiled to WebAssembly by `npm run wasm` (cmd/core-wasm, docs/wasm-core.md).
// Only the web build has it: the desktop build gets the same answers from Go directly, and vite.config.js swaps this file for a stub there.
// The module is a WASI reactor; the boundary is bytes in its linear memory: write UTF-8 into a buffer from `core_alloc`, call an export with
// the address and length, and read the JSON it returns (address in the high 32 bits, length in the low 32), then `core_free` both buffers.
// The wasm is a separate hashed asset, fetched on first use (after the first paint, as Harper's is), so every call is async.

// The four WASI calls TinyGo's runtime makes (an import it did not list fails to link, so a new one shows in the tests). Nothing here has
// arguments or a place to write, so each is the smallest honest answer; 0 is success.
function wasiImports(getMemory) {
  const view = () => new DataView(getMemory().buffer);
  return {
    args_sizes_get: (argc, size) => {
      view().setUint32(argc, 0, true);
      view().setUint32(size, 0, true);
      return 0;
    },
    args_get: () => 0,
    random_get: (ptr, len) => {
      crypto.getRandomValues(new Uint8Array(getMemory().buffer, ptr, len));
      return 0;
    },
    fd_write: (_fd, iovs, count, written) => {
      let n = 0;
      for (let i = 0; i < count; i++) n += view().getUint32(iovs + i * 8 + 4, true);
      view().setUint32(written, n, true); // swallowed: the page has no stdout
      return 0;
    },
  };
}

// The functions of an instantiated module (`instantiate` takes the imports and returns the {instance} promise).
async function connect(instantiate) {
  let memory;
  const { instance } = await instantiate({ wasi_snapshot_preview1: wasiImports(() => memory) });
  const ex = instance.exports;
  memory = ex.memory;
  ex._initialize();

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  // Calls an export that takes a string and returns JSON. The memory is read after the call: it may have grown, which detaches old views.
  const call = (name, text) => {
    const bytes = encoder.encode(text);
    const input = ex.core_alloc(bytes.length);
    new Uint8Array(memory.buffer, input, bytes.length).set(bytes);
    const packed = ex[name](input, bytes.length);
    ex.core_free(input);
    const ptr = Number(packed >> 32n);
    const len = Number(packed & 0xffffffffn);
    const json = decoder.decode(new Uint8Array(memory.buffer, ptr, len));
    ex.core_free(ptr);
    return JSON.parse(json);
  };
  return { summarize: (content) => call("summarize", content) };
}

let loading = null;
let bytes = null;

// Tests (and anything without a network) hand the module's bytes in instead of fetching it.
export function useCoreBytes(source) {
  bytes = source;
  loading = null;
}

const load = () =>
  (loading ??= connect((imports) =>
    bytes
      ? WebAssembly.instantiate(bytes, imports)
      : WebAssembly.instantiateStreaming(fetch(new URL("../wasm/core.wasm", import.meta.url)), imports),
  ).catch((err) => {
    loading = null; // a failed load (offline on the very first visit) is tried again on the next call
    throw err;
  }));

// Loads the module ahead of the first call, so the service worker has cached it before the user could go offline (a save needs it). It
// never throws: a failed warm-up is only a missed head start, and the next call tries again.
export const warmCore = () =>
  load().then(
    () => undefined,
    () => undefined,
  );

// What the drafts list shows for a draft's text: {title, excerpt, tasks, tasksTotal, tasksDone}. The same code as the desktop app's.
export const summarize = async (content) => (await load()).summarize(content);
