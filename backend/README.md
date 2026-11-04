# Backend (scaffold)

The optional sync service for Harper Pad: `harper-pad-sync` (the API) and `harper-pad-admin` (Go + HTMX, for enrollment URLs
and devices), on PostgreSQL. The design is in [`docs/sync.md`](../docs/sync.md). **Nothing here works yet beyond the health
endpoints and the admin pages (on stub data)**: this directory is the layout, the stub commands and the end-to-end stack, to be filled in following the build order
in that document.

This is its own Go module (`github.com/cthtrifork/harper-pad/backend`) and shares no code with the desktop app. The Kubernetes
manifests are not kept in this repository.

| Path | What |
|---|---|
| `cmd/harper-pad-sync`, `cmd/harper-pad-admin` | The two commands (stubs that serve the health endpoints below) |
| `internal/admin` | The admin UI (Go `html/template` + vendored htmx 2, embedded; no inline script or style, same-origin and CSRF checks). It reaches the database only through the `Store` interface; a stub (`ErrNotImplemented`, the default) and an in-memory demo implementation stand in until the PostgreSQL one exists |
| `internal/` | `server` (health endpoints, graceful shutdown), `config` (environment), `store` (the pgx pool; all SQL and `migrations/` later), and `syncapi`, `admin`, `auth`, `protocol`: empty packages with a package comment each |
| `Containerfile.sync`, `Containerfile.admin` | Container images; the build context is this directory |
| `testdata/protocol/` | Fixtures for the protocol (empty) |
| `test/e2e/` | The end-to-end stack (`compose.yaml`, `Caddyfile`, `certs.sh`) and the Playwright test |

## Running in Kubernetes

Both commands run as `harper-pad-sync serve` / `harper-pad-admin serve` and are configured by environment only.

| Variable | |
|---|---|
| `LISTEN_ADDR` | Default `:9000` (sync) and `127.0.0.1:9001` (admin, loopback: only its cloudflared sidecar reaches it) |
| `PUBLIC_URL` | Sync only, required, must be `https:` or the service refuses to start |
| `SYNC_PUBLIC_URL` | Admin only, required, `https:`: the sync service's public address, which enrollment URLs (`<it>/join#<token>`) are built from |
| `ADMIN_DEMO` | Admin only. `true` serves seeded in-memory data instead of the database stub, to look at the UI. Never set it in a deployment |
| `METRICS_ADDR` | Where `/metrics` is served, on its own listener so it is never on the public route. Default `:9102` (sync); admin has none unless set, because its pod accepts no traffic except from its own sidecar |
| `DATABASE_URL` | Optional. When unset, the standard libpq variables (`PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGSSLMODE`, `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY`) are read, which is how the cluster does client-certificate login |

| Endpoint | Use it for | |
|---|---|---|
| `GET /healthz` | `livenessProbe` | The process is serving. Never touches PostgreSQL, so a database outage does not restart healthy pods |
| `GET /readyz` | `readinessProbe` | A PostgreSQL round trip succeeds (2 s limit, so set `timeoutSeconds: 3`; the result is cached for 2 s and logged only when it changes). 503 while the database is unreachable and while shutting down |

Metrics (Prometheus, `client_golang`, a private registry): `GET :9102/metrics` has the Go runtime and process collectors,
`harper_pad_http_requests_total` and `harper_pad_http_request_duration_seconds` labelled by method and route *pattern* (never the
raw path, so the label values are bounded) and `harper_pad_db_pool_*` from the pgx pool (connections by state, acquires, empty
acquires and wait time: a pool that is too small shows there before `/readyz` fails). The cluster needs a NetworkPolicy that lets
Prometheus reach port 9102 and a PodMonitor; both live in the gitops repository.

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
`https://sync.localhost:18443` (set `E2E_PORT` to use another host port) with certificates from Caddy's own CA; Chromium is started trusting only Caddy's CA (its intermediate's key, via `--ignore-certificate-errors-spki-list`), so certificate errors are not ignored.

PostgreSQL in the stack runs the production login: TLS required, and a client certificate whose common name is the role, no password.
`certs.sh` makes a throwaway ECDSA CA and the certificates inside the postgres container, PostgreSQL requires TLS 1.3, `harper-pad-sync` connects with the libpq
variables (`PGSSLMODE=verify-full`, `PGSSLROOTCERT`, `PGSSLCERT`, `PGSSLKEY`), and the test checks that TLS without a certificate,
a certificate with another common name and a plain connection are all refused. What it still does not check is cert-manager issuing
and renewing, and the NetworkPolicy.

`podman compose` is only a front end: it needs a provider, `podman-compose` (`pip install --user podman-compose`) or
`docker-compose`. The stack has been run with podman 5.8 and podman-compose 1.6; `docker compose` has not been tried.

## Images

`.github/workflows/backend-image.yml` builds both Containerfiles on every change under `backend/` (and weekly), scans the image
with Trivy (a CRITICAL finding with a fix fails; HIGH ones are listed in the job summary) and starts it to check `/healthz`.
Nothing is published from there. `release.yml` publishes `ghcr.io/cthtrifork/harper-pad-sync` and `harper-pad-admin` for
`linux/amd64` when a version is cut ("Tag and release", see [releasing](../docs/releasing.md)), tagged `1.2.3`, `v1.2.3`
and, for a final release, `latest`, with SBOM and provenance attestations; the job summary lists each image's digest, which is what the
cluster pins. The packages
are private by default (Settings, or the package page, to make them public; otherwise the cluster needs an `imagePullSecret`).
