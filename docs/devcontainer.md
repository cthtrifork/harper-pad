# Dev container and hot reload

A dev container with Go and Node (both baked into the `Dockerfile`, copied from the official `golang` and `node` images, pulled from `mirror.gcr.io`, no dev container features) and the `wails3` CLI. It runs the app in **server mode** (the GUI needs GTK, which the container does not have) and you use it in a browser.

## Start

1. Install Docker or Podman plus an editor that speaks dev containers (VS Code *Dev Containers*, GitHub Codespaces, or `devcontainer up`).
2. Open the repository in the container. `post-create.sh` installs the frontend dependencies, the `wails3` CLI and the Go dev tools.
3. Run `make dev` and open `http://localhost:8080` (the port is forwarded).

## Editor

The Go extension formats with `goimports` and lints with golangci-lint on save, using `.github/linters/golangci.yml`; Biome formats the Vue, JS, CSS, HTML and JSON files. Tool versions are pinned in the `Makefile`.

## File ownership

The container user is `vscode` with `updateRemoteUserUID` on, so on Linux it takes your host uid and your clone stays writable (`node_modules`, `tmp/`, Go caches all belong to you). `post-create.sh` also marks the workspace as a git `safe.directory` for setups where the owner still differs, and `.gitattributes` keeps `*.sh` on LF so a Windows clone still runs.

## What reloads

`make dev` runs `wails3 dev` with `build/config.yml`: Vite serves the Vue app with hot module replacement, and a change to a `.go` file rebuilds and restarts the server-mode binary.

After changing an exported method of a service in `internal/app` or a type it exchanges, run `make bindings` and commit `frontend/bindings`.

## Checks

The container is headless only: `CGO_ENABLED=0` and `GOFLAGS=-tags=server` are set, so plain `go build`, `go test`, `go vet` and `go run .` all work without GTK, and `make vet` uses `VET_TAGS=server,production`. `make test` runs without `-race` (it needs cgo, hence GTK); CI still uses it.

`make check` (gofmt, `go mod tidy -diff`, vet, tests, headless build) works in the container. The desktop GUI build is not supported here; `wails3 dev` works because `build/config.yml` builds server mode.

## Troubleshooting

- *Port 8080 is in use*: set `WAILS_SERVER_PORT` in `containerEnv` and `forwardPorts`.
- *"connection was reset" in the browser*: the server must listen on `0.0.0.0` (`WAILS_SERVER_HOST`, already set); a loopback bind is not reachable through the editor's port forward.
