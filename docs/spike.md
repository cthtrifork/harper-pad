# Spike: harper.js inside a Wails window

Question: does `harper.js` (about 20 MB of WebAssembly, run in a Web Worker) work in the Wails webview?

`frontend/src/lib/harper.js` creates a `WorkerLinter` with one of two binaries, chosen in the UI:

| Binary | How the wasm arrives | Risk |
|---|---|---|
| `harper.js/slimBinaryInlined` | base64 inside a ~27 MB JS chunk | none for MIME or paths; larger bundle, slower parse |
| `harper.js/slimBinary` | separate hashed `.wasm` asset, fetched at runtime | needs `application/wasm` and worker loading from the asset server |

## Results

Verified (headless server build, Chromium via Playwright, `-tags server`):

- Both binaries load, `setup()` finishes and the sample text yields 4 findings (article, two spellings, a repeated word).
- The Wails asset server answers `.wasm` with `Content-Type: application/wasm` (Go's built-in MIME table).
- The Go bridge (`PadService.Version`) works from the same page.
- Setup took 3.6 to 8 s in this sandbox (software Chromium); a lint of the sample took 0.2 to 0.4 s.

Verified on the real target (release build, Fedora, WebKitGTK; UA `AppleWebKit/605.1.15 ... Version/60.5`):

| Binary | Setup | Lint of the sample |
|---|---|---|
| `slimBinary` (`.wasm` asset) | 589 ms | 48 ms |
| `slimBinaryInlined` (base64) | 778 ms | 55 ms |

Both reach `ready` and report the same 4 findings. So Web Worker, wasm compile and the native asset scheme all work;
the `url` flavour is faster and avoids the 27 MB JS chunk, so the inlined variant can go. Memory use was not measured.

## Findings so far

- `harper-editor` and `lint-framework` (Harper's own editor UI) are not on npm; only `harper.js` is. The plan is a
  CodeMirror 6 integration on top of `harper.js`, not a vendored Svelte editor.
- The wasm adds about 20 MB to the binary (8 MB gzipped).
