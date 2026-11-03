# Harper Pad

A small desktop writing app for Linux and Windows. Go + [Wails v3](https://v3alpha.wails.io/) with a Vue 3 frontend.

## What it solves

1. **Grammar and spelling checks that stay on your machine.** [Harper](https://writewithharper.com) runs as
   WebAssembly inside the app, so your text is never sent to a cloud service. A first check takes about half a second
   and later ones under 50 ms (measured in a release build on Fedora).
2. **A place for quick text that is not a file yet.** The scratch pad is a drawer of drafts. Notes, to-do lists and
   half-written paragraphs are kept by the app and saved as you type, so there is no file name to invent and no folder
   to pick. A draft becomes a file only when you choose "Save as file".

Markdown documents and drafts can also be shown side by side with a rendered preview.

## Status

**Spike.** The window lints a textarea with `harper.js` in a Web Worker, which proves the stack works in WebKitGTK.
The editor, the drafts drawer and the markdown preview are not built yet; `TODO.md` has the plan.

## Develop

```sh
make help      # list targets
make frontend  # build the Vue app into frontend/dist (needed before any go build/run)
make check     # gofmt, go mod tidy, vet, tests and a headless build; no GTK needed
make lint      # golangci-lint plus Biome
make run       # desktop window (needs GTK4 + WebKitGTK 6)
```

Without GTK (CI, sandboxes) use server mode: `CGO_ENABLED=0 go run -tags server .` serves the UI on
`http://localhost:8080` (`WAILS_SERVER_PORT` changes the port).
