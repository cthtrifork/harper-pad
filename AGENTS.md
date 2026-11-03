# AGENTS.md

Start here. This file is for AI coding agents (and humans) picking up work on **Harper Pad**, a Go + Wails v3
desktop app: a Harper-checked editor plus a scratch pad drawer. It is at the spike stage: the window only lints a textarea.

## Commands

`make help` lists the targets.

```sh
make frontend     # Vue app -> frontend/dist; required before any go build/run, not before vet/test
make format       # gofmt plus Biome
make test         # go test -race -count=1 ./...
make vet          # go vet, with and without -tags production
make build-server # headless build (CGO_ENABLED=0, -tags server,production), no GTK
make run-mcp      # desktop app with Wails MCP server on 127.0.0.1:9099 (dev only, docs/mcp.md)
make bindings     # regenerate frontend/bindings (needs the wails3 CLI: make wails3-install)
```

## Rules that are easy to get wrong

- **Never try to build or run the GTK GUI** in a sandbox: no GTK4/WebKitGTK there. Use `CGO_ENABLED=0` with
  `-tags server` and exercise the UI over HTTP. Say in the PR that the GUI path was not tested.
- After changing an exported `PadService` method or a type it exchanges, run `make bindings` and commit
  `frontend/bindings`; never hand-edit it. `frontend/dist` is untracked build output except `.gitkeep`.
- Run `make format-frontend lint-frontend` before pushing frontend changes; CI's `lint` job fails on unformatted code.
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
| `internal/app` | `PadService` (the binding the frontend calls), tray, icons, updater (`update*.go`), MCP/pprof dev hooks and their build guards |
| `internal/selfupdate` | GitHub-release provider for the in-app updater (release builds only) |
| `frontend/` | Vue 3 + Vite app; `lib/harper.js` wraps `harper.js`; generated bindings are committed |
| `Taskfile.yml`, `build/config.yml`, `.devcontainer/`, `scripts/dev.sh` | `wails3 dev` config (server mode), dev container and the `make dev` loop, see `docs/devcontainer.md` |
| `build/linux` | Desktop file and nfpm packaging (`scripts/package-linux.sh`); the desktop file name equals the application id in `main.go` |
| `build/windows` | Windows icon, manifest and version info for the exe (`scripts/package-windows.sh`), see `docs/windows.md` |
| `.github` | Workflows (`ci`, `security`, `release`, `tag-release`, `actions-lint`, `pr-title`, `release-drafter`, `renovate`, `update-branches`, `trivy-cache`), linters, Renovate |

- Wails' MCP server (`-tags mcp`) and the pprof endpoint (`-tags pprof`) are development only: `mcp_guard.go` and `pprof_guard.go` reject them with `production`, and CI greps the release binary. See `docs/mcp.md`, `docs/pprof.md`.
- `application.New` must be called before `InitUpdater`, which runs before `Run` (self-update tutorial order); see `docs/self-update.md`, `docs/releasing.md`.
- Open work is tracked in `TODO.md`.
