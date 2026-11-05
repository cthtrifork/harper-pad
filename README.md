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

Markdown can be shown side by side with a rendered preview, and the app updates itself from GitHub releases.

## Web app

The web version is hosted on GitHub Pages at <https://harper.portableinfo.cloud/>. It runs entirely in the browser,
keeps its data in IndexedDB, works offline after the first load, and can be added to a phone's Home Screen. A published
release replaces the site, and the head of `main` is at `/preview/`. See [`docs/pages.md`](docs/pages.md) for how the two builds differ and how to deploy.

## Sync (optional)

Notes can follow you between the desktop app and the phone through your own server. It is off unless the build sets
`SYNC_ORIGIN`. The devices stay the source of truth; the server is plain storage and can be rebuilt from them. See the
[backend](backend/README.md) (`harper-pad-sync` and `harper-pad-admin` on PostgreSQL) and the design in [`docs/sync.md`](docs/sync.md).

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
