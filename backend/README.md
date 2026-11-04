# Backend (scaffold)

The optional sync service for Harper Pad: `harper-pad-sync` (the API) and `harper-pad-admin` (Go + HTMX, for enrollment URLs
and devices), on PostgreSQL. The design is in [`docs/sync.md`](../docs/sync.md). **Nothing here works yet beyond the health
endpoints**: this directory is the layout, the stub commands and the end-to-end stack, to be filled in following the build order
in that document.

This is its own Go module (`github.com/cthtrifork/harper-pad/backend`) and shares no code with the desktop app. The Kubernetes
manifests are not kept in this repository.

| Path | What |
|---|---|
| `cmd/harper-pad-sync`, `cmd/harper-pad-admin` | The two commands (stubs that serve the health endpoints below) |
| `internal/` | `server` (health endpoints, graceful shutdown), `config` (environment), `store` (the pgx pool; all SQL and `migrations/` later), and `syncapi`, `admin`, `auth`, `protocol`, `pgtls`: empty packages with a package comment each |
| `Containerfile.sync`, `Containerfile.admin` | Container images; the build context is this directory |
| `testdata/protocol/` | Fixtures for the protocol (empty) |
| `test/e2e/` | The end-to-end stack (`compose.yaml`, `Caddyfile`) and the Playwright test |

## Running in Kubernetes

Both commands run as `harper-pad-sync serve` / `harper-pad-admin serve` and are configured by environment only.

| Variable | |
|---|---|
| `LISTEN_ADDR` | Default `:9000` (sync) and `127.0.0.1:9001` (admin, loopback: only its cloudflared sidecar reaches it) |
| `PUBLIC_URL` | Sync only, required, must be `https:` or the service refuses to start |
| `DATABASE_URL` | Optional. When unset, the standard libpq variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSSLMODE`, `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY`) are read, which is how the cluster does client-certificate login |

| Endpoint | Use it for | |
|---|---|---|
| `GET /healthz` | `livenessProbe` | The process is serving. Never touches PostgreSQL, so a database outage does not restart healthy pods |
| `GET /readyz` | `readinessProbe` | A PostgreSQL round trip succeeds (2 s limit, so set `timeoutSeconds: 3`; the result is cached for 2 s and logged only when it changes). 503 while the database is unreachable and while shutting down |

PostgreSQL does not have to be up at start: the pool connects lazily, `/readyz` reports 503 until it is, and the pod recovers by
itself. On SIGTERM `/readyz` turns 503, the process waits 5 s for Traefik and the endpoints to notice, drains in-flight requests
(up to 20 s) and exits 0, so the default `terminationGracePeriodSeconds` of 30 is enough (5 + 20 = 25). The driver is
[pgx v5](https://github.com/jackc/pgx), the most widely used maintained PostgreSQL driver for Go.

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

## Images

`.github/workflows/backend-image.yml` builds both Containerfiles for `linux/amd64` and `linux/arm64`. A push to `main` that touches
`backend/` publishes `ghcr.io/cthtrifork/harper-pad-sync` and `harper-pad-admin` tagged `sha-<commit>`, with SBOM and provenance
attestations; the job summary lists each image's digest, which is what the cluster pins. Pull requests only build. The packages
are private by default (Settings, or the package page, to make them public; otherwise the cluster needs an `imagePullSecret`).
