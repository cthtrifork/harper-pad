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

**Not verified**: WebKitGTK, the real target. There is no GTK in the sandbox. Run `make run` on the homeserver and check
that the state reads `ready` for both binaries. Things that can differ there: Web Worker module support, wasm
compile time, and the native asset scheme versus plain HTTP.

## Findings so far

- `harper-editor` and `lint-framework` (Harper's own editor UI) are not on npm; only `harper.js` is. The plan is a
  CodeMirror 6 integration on top of `harper.js`, not a vendored Svelte editor.
- The wasm adds about 20 MB to the binary (8 MB gzipped).
