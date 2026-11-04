# Backend (scaffold)

The optional sync service for Harper Pad: `harper-pad-sync` (the API) and `harper-pad-admin` (Go + HTMX, for enrollment URLs
and devices), on PostgreSQL. The design is in [`docs/sync.md`](../docs/sync.md). **Nothing here works yet beyond a health
endpoint**: this directory is the layout, the stub commands and the end-to-end stack, to be filled in following the build order
in that document.

This is its own Go module (`github.com/cthtrifork/harper-pad/backend`) and shares no code with the desktop app. The Kubernetes
manifests are not kept in this repository.

| Path | What |
|---|---|
| `cmd/harper-pad-sync`, `cmd/harper-pad-admin` | The two commands (stubs that answer `GET /healthz`) |
| `internal/` | `syncapi`, `admin`, `auth`, `protocol`, `store` (all SQL, with `migrations/`), `pgtls`, `config`: empty packages with a package comment each |
| `Containerfile.sync`, `Containerfile.admin` | Container images; the build context is this directory |
| `testdata/protocol/` | Fixtures for the protocol (empty) |
| `test/e2e/` | The end-to-end stack (`compose.yaml`, `Caddyfile`) and the Playwright test |

```sh
make help    # list the targets
make build   # build both commands into ./bin
make test    # go test ./...
make e2e     # build the web app, start the stack, run the test, remove the stack
```

`make e2e` needs Node 22+, Playwright (`PLAYWRIGHT_DIR`, a global `playwright-core`, or `E2E_BROWSER_PATH` for a Chromium binary) and
`podman compose` or `docker compose`. The stack serves the web build at `https://app.localhost:18443` and the sync service at
`https://sync.localhost:18443` (set `E2E_PORT` to use another host port) with certificates from Caddy's own CA; the test ignores certificate errors.

`podman compose` is only a front end: it needs a provider, `podman-compose` (`pip install --user podman-compose`) or
`docker-compose`. The stack has been run with podman 5.8 and podman-compose 1.6; `docker compose` has not been tried.

Throwaway change to verify that a backend-only pull request runs only the backend jobs. Do not merge.
