# AGENTS.md

Start here. This file is for AI coding agents (and humans) picking up work on **Harper Pad**, a Go + Wails v3
desktop app: a Harper-checked editor plus a scratch pad drawer. It is at the spike stage (`docs/spike.md`).

## Commands

`make help` lists the targets.

```sh
make frontend     # Vue app -> frontend/dist; required before any go build/run, not before vet/test
make format       # gofmt plus Biome
make test         # go test -race -count=1 ./...
make vet          # go vet, with and without -tags production
make build-server # headless build (CGO_ENABLED=0, -tags server,production), no GTK
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
| `internal/app` | `PadService` (the binding the frontend calls), tray, icons, version stamp |
| `frontend/` | Vue 3 + Vite app; `lib/harper.js` wraps `harper.js`; generated bindings are committed |
| `Taskfile.yml`, `build/config.yml` | `wails3 dev` config (server mode) |
| `build/linux` | Desktop file; its name equals the application id set in `main.go` |
| `.github` | Workflows (`ci`, `actions-lint`, `pr-title`, `release-drafter`, `renovate`, `update-branches`), linters, Renovate |
