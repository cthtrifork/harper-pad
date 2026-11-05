# AGENTS.md

Start here. This file is for AI coding agents (and humans) picking up work on **Harper Pad**, a Go + Wails v3
desktop app: a Harper-checked editor plus a scratch pad drawer. The editor, Problems panel, drafts drawer, markdown Edit / Split / Preview views, saving a draft to a file (Ctrl+Shift+S, then Ctrl+S) and optional sync work; opening files is not built. What is left before sync can be switched on is the checklist in `docs/sync.md`.

## Commands

`make help` lists the targets.

```sh
make frontend     # Vue app -> frontend/dist; required before any go build/run, not before vet/test
make format       # gofmt plus Biome
make test         # go test -race -count=1 ./...
make test-frontend # the frontend unit tests (node --test, needs `npm ci` in frontend/); shares fixtures with the Go tests
make vet          # go vet, with and without -tags production
make build-server # headless build (CGO_ENABLED=0, -tags server,production), no GTK
make run-mcp      # desktop app with Wails MCP server on 127.0.0.1:9099 (dev only, docs/mcp.md)
make bindings     # regenerate frontend/bindings (needs the wails3 CLI: make wails3-install)
```

## Rules that are easy to get wrong

- **Never try to build or run the GTK GUI** in a sandbox: no GTK4/WebKitGTK there. Use `CGO_ENABLED=0` with
  `-tags server` and exercise the UI over HTTP. Say in the PR that the GUI path was not tested.
- After changing an exported method of a service in `internal/app` (`PadService`, `DraftService`, `SyncService`, `SettingsService`, `UpdateService`) or a type it exchanges, run `make bindings` and commit
  `frontend/bindings`; never hand-edit it. `frontend/dist` is untracked build output except `.gitkeep`.
- Run `make format-frontend lint-frontend` before pushing frontend changes; CI's `lint` job fails on unformatted code.
- **SQL only in Go.** All SQL lives in `internal/store`; the frontend calls specific service methods through the generated bindings and never sends SQL. See `docs/storage.md`.
- Security model, the page's Content-Security-Policy and the OWASP mapping are in `docs/security.md`. Do not loosen the policy in `frontend/vite.config.js`; never use `v-html` or `innerHTML` with text from drafts, Harper or the network.
- **Always open a PR** from a new branch off `main`; do not push to `main`.
- **PR titles are `type(scope)!: summary`** (`feat`, `fix`, `security`, `perf`, `refactor`, `docs`, `test`,
  `chore`, `ci`, `build`, `deps`; `!` for breaking). `pr-title.yml` checks it and Release Drafter builds the notes
  and next version from it (`.github/release-drafter.yml`).
- Pin GitHub Actions by commit SHA with a version comment, as the existing workflows do.
- Be honest about verification: say what you ran and what you could not test.

## Layout

| Path | What |
|---|---|
| `main.go` | Thin entry point: Wails app and window, embeds `frontend/dist` |
| `backend/` | The optional sync service, its own Go module that shares no code with the app: `harper-pad-sync`, `harper-pad-admin`, PostgreSQL, and the end-to-end stack in `test/e2e/`. Built; see `backend/README.md` and the design in `docs/sync.md` |
| `internal/app` | The Wails services the frontend calls (`PadService` for startup and the version, `DraftService`, `SyncService` (the sync state for the desktop build), `SettingsService`, `UpdateService`; `service.go` creates them, `database.go` is the one SQLite file the first two share), tray, icons, updater (`update*.go`), MCP/pprof dev hooks and their build guards |
| `internal/store` | The app's database: one SQLite file (pure Go) with the drafts and the settings, see `docs/storage.md` |
| `internal/selfupdate` | GitHub-release provider for the in-app updater (release builds only) |
| `frontend/` | Vue 3 + Vite app; `lib/harper.js` wraps `harper.js`; `lib/backend.js` is the only place that talks to Go (desktop) or IndexedDB (web build for GitHub Pages, `docs/pages.md`); `lib/editor/` is the CodeMirror editor (`lint`, `theme`, `mode`, `stats`, `problems`); the sync client (both builds: IndexedDB in the browser, `SyncService` on desktop through `lib/desktopSync.js`) is `lib/sync*.js`, `dpop.js` and `useSync.js`, and **all syncing and conflict handling is `createSyncer` in `lib/syncRun.js`**: add no second path (`syncOneEngine.test.js` fails if another module decides or uploads drafts); `SYNC_ORIGIN` (build time) turns sync on and names the server in the CSP; generated bindings are committed |
| `frontend/src/styles` | Plain CSS, one file per component (`drafts-drawer.css` for `DraftsDrawer.vue`), no `<style>` blocks in components (the exception is `update-button.css`, imported by its lazy component). `index.css` imports them, `tokens.css` holds the design tokens, `menu.css` the pop-up menus the header and status bar share. Start a component's rules from its root class so files cannot collide; add a file rather than growing one, so branches rarely touch the same lines |
| `Taskfile.yml`, `build/config.yml`, `.devcontainer/`, `scripts/dev.sh` | `wails3 dev` config (server mode), dev container and the `make dev` loop, see `docs/devcontainer.md` |
| `build/linux` | Desktop file and nfpm packaging (`scripts/package-linux.sh`); the desktop file name equals the application id in `main.go` |
| `build/windows` | Windows icon, manifest and version info for the exe (`scripts/package-windows.sh`), see `docs/windows.md` |
| `.github` | Workflows (`ci`, `security`, `release`, `tag-release`, `actions-lint`, `pr-title`, `release-drafter`, `renovate`, `update-branches`, `trivy-cache`, `pages`, `preview` (opt-in PR previews on the site), and the PR reports `dependency-scan`, `screenshots`, `lighthouse`), linters, Renovate |

- Wails' MCP server (`-tags mcp`) and the pprof endpoint (`-tags pprof`) are development only: `mcp_guard.go` and `pprof_guard.go` reject them with `production`, and CI greps the release binary. See `docs/mcp.md`, `docs/pprof.md`.
- `application.New` must be called before `InitUpdater`, which runs before `Run` (self-update tutorial order); see `docs/self-update.md`, `docs/releasing.md`.
- UI conventions (button types, tokens, motion, UX rules) are in `docs/design-cheatsheet.html`; open it in a browser and follow it for new UI.
- How the pieces fit together (frontend hosts, Go service, data flow) is in `docs/architecture.md`.
- What is left for sync is the "Before release" checklist in `docs/sync.md`.
