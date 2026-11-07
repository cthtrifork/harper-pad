# Shared Go logic in the web build (wasm)

The desktop app and the web (PWA) build must agree on a few pure functions, such as what the drafts list shows for a draft. `internal/core`
is the one source: the desktop build calls it directly (through `internal/store`), the web build runs the same package compiled to
WebAssembly (`cmd/core-wasm` -> `frontend/src/wasm/core.wasm`, called through `frontend/src/lib/core.js`). Both run the same fixtures in
`internal/core/testdata/` (`summarize_test.go`, `core.test.js`).

## What lives in `internal/core`

Pure functions over values: standard library only, no SQLite, no Wails, no I/O, and **no `regexp`** (slow and large in wasm). Today that is
`Summarize`. Next candidates: `syncPlan`'s `decide` and `settle`, then `suggestName`. Not candidates: `contentHash` (`crypto.subtle` is
native and faster), browser APIs, and anything on CodeMirror's per-keystroke path.

## The boundary

`cmd/core-wasm` is a WASI reactor. It exports `core_alloc`, `core_free` (not `malloc`/`free`: TinyGo's runtime exports those) and one
function per core function. The caller writes UTF-8 into a buffer from `core_alloc`, calls the function with its address and length, and gets
one 64-bit value: the address (high half) and length (low half) of a JSON result. `core.js` does this and supplies the few WASI imports Go's
runtime asks for. To add a function: write it in `internal/core`, export it in `cmd/core-wasm/main.go`, wrap it in `core.js`, add fixtures.

Every call is async, because the wasm is fetched on first use. So `webDrafts.js` works out the summary **before** an IndexedDB transaction
opens (waiting on the wasm inside one would let it commit), and `main.js` fetches the module as soon as the service worker is ready, which
caches it: otherwise a new release's module would only be fetched by the first save, and a save with no network would fail.

## Building it

`scripts/build-wasm.mjs` (`npm run wasm`; the `build:web` and `test` scripts run it first) compiles with TinyGo in its
container image (podman, nothing to install; pinned by tag and digest, kept current by Renovate). The build cache lives in
`~/.cache/harper-pad-tinygo`, so only the first build is slow (about 80 s, then about 30 s), and nothing is rebuilt while the module is newer
than its Go. The Pages build, the previews and the frontend tests need podman (preinstalled on the Linux runners), not Go.

The desktop build has no wasm: it gets the same answers from Go, and the draft the Go side returns carries its `title`. `vite.config.js`
swaps `core.js` for a stub there, so the desktop bundle holds no wasm file and its builds (Windows included) need no container.

## Measured (Node 22; TinyGo 0.44.0)

| | JS (before) | Go wasm | TinyGo wasm |
|---|---|---|---|
| Module | none | 3.0 MB, 0.86 MB gzip | 1.0 MB, 0.37 MB gzip |
| Cold start | none | about 100 ms | about 50 ms |
| `summarize`, short note | 0.01 ms | 0.13 ms | 0.27 ms |
| `summarize`, 1 MB draft | 66-173 ms | 8-20 ms | 5-23 ms |

A short note costs more than the JS did, but it runs in a debounced autosave and a fraction of a millisecond is invisible. What counts is the
download and the cold start (Harper's own wasm is 20 MB). A draft is at most 1 MB, and there the Go code is several times faster. The first
version used `regexp`, like the JavaScript, and took 1.7 s for 1 MB under TinyGo, which is why `Summarize` is a single hand-written pass
and why the awkward cases it had to keep (`#######`, `\v`, a non-breaking space, a box with no text, exact clip lengths) are fixtures.

The Content-Security-Policy is unchanged: `'wasm-unsafe-eval'` was already there for Harper, and `core.wasm` is same-origin.
