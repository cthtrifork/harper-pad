# Harper Pad

[![CI](https://github.com/cthtrifork/harper-pad/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cthtrifork/harper-pad/actions/workflows/ci.yml)
[![Security](https://github.com/cthtrifork/harper-pad/actions/workflows/security.yml/badge.svg?branch=main)](https://github.com/cthtrifork/harper-pad/actions/workflows/security.yml)
[![Pages](https://github.com/cthtrifork/harper-pad/actions/workflows/pages.yml/badge.svg?branch=main)](https://github.com/cthtrifork/harper-pad/actions/workflows/pages.yml)
[![Release](https://img.shields.io/github/v/release/cthtrifork/harper-pad)](https://github.com/cthtrifork/harper-pad/releases)

A small desktop writing app for Linux and Windows, also available as a [web app](https://harper.portableinfo.cloud/) on GitHub Pages. Go + [Wails v3](https://v3alpha.wails.io/) with a Vue 3 frontend.

![The editor with grammar and spelling problems listed in the Problems panel](https://raw.githubusercontent.com/cthtrifork/harper-pad/bot/update-screenshots/docs/screenshots/01-editor-with-problems.png)

## What it solves

1. **Grammar and spelling checks that stay on your machine.** [Harper](https://writewithharper.com) runs as
   WebAssembly inside the app, so your text is never sent to a cloud service. A first check takes about half a second
   and later ones under 50 ms (measured in a release build on Fedora).
2. **A place for quick text that is not a file yet.** The scratch pad is a drawer of drafts. Notes, to-do lists and
   half-written paragraphs are kept by the app and saved as you type, so there is no file name to invent and no folder
   to pick. A draft becomes a file only when you choose "Save as file".

Markdown documents and drafts can also be shown side by side with a rendered preview.

## Status

The window has a CodeMirror editor checked by `harper.js` (WebAssembly in a Web Worker), a Problems panel with fixes,
the scratch pad drawer of drafts with autosave and search, and in-app updates. The same frontend runs in the browser
as an installable offline web app ([`docs/pages.md`](docs/pages.md)). Markdown shows side by side with a preview.

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
