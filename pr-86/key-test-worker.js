// Runs one Argon2id derivation off the main thread, so a heavy run cannot freeze the page.
// argon2.umd.min.js is hash-wasm 4.12.0 (MIT, see argon2.LICENSE.txt), vendored for this throwaway test page only.
importScripts("argon2.umd.min.js");

self.onmessage = async (event) => {
  const { memKiB, iterations } = event.data;
  try {
    const start = performance.now();
    const hash = await self.hashwasm.argon2id({
      password: "correct horse battery staple",
      salt: crypto.getRandomValues(new Uint8Array(16)),
      parallelism: 1,
      iterations,
      memorySize: memKiB,
      hashLength: 32,
      outputType: "hex",
    });
    self.postMessage({ ok: true, ms: Math.round(performance.now() - start), hash: hash.slice(0, 16) });
  } catch (error) {
    self.postMessage({ ok: false, error: String(error) });
  }
};
