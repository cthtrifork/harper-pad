# TODO

## 1. Sync (proposal: `docs/sync.md`)

- [x] **iPhone check for the device-bound key.** Done on 4 November 2026 with a throwaway page (PR #86, not merged), in a Safari tab and
      as a Home Screen app; the keys also survived 20.6 hours on 5 November. Results are in `docs/sync.md`. The longer iPhone
      checks (a week, a phone restart) were dropped.
- [x] **Desktop engine check for the device-bound key:** Edge on Windows passed on 5 November 2026 (a browser tab, Edge 156: 17 pass,
      0 fail, `persist()` true). The WebKitGTK check for the Linux window was dropped. Close PR #86 (the throwaway test page).
- [x] Local groundwork: sync state in its own table/store, hash-based change tracking, apply-remote store methods, additive SQLite
      and IndexedDB (`DB_VERSION` 3) migrations that older builds survive, with tests. The host calls and bindings come with the sync module.
- [x] The server's infrastructure and the admin service: `harper-pad-admin` (Go + HTMX: enrollment URLs, devices) behind a Cloudflare
      Tunnel and Access with OIDC, two container images, PostgreSQL with client-certificate roles, the schema migrations that
      `harper-pad-sync` runs at start, and the manifests in the cluster's GitOps repository. Deployed at
      `harper-sync.portableinfo.cloud` and smoke tested.
- [x] Enrollment in `harper-pad-sync`: `POST /enroll` (spends the invite, binds the device token to the DPoP key), the DPoP proof check and
      the device authentication the other routes use, the CORS allowlist (`CORS_ALLOWED_ORIGINS`, logs each rejected origin once). Set `CORS_ALLOWED_ORIGINS` in the cluster manifests once the origins are known.
- [x] `harper-pad-admin` owns the tables and applies the migrations; `harper-pad-sync` has row-level rights only and waits for the schema.
      **Cluster:** make `harper_admin` the owner of the `harper` database (CloudNativePG `initdb.owner`) and the migrator, keep `harper_sync` a plain
      login role, and if tables already exist owned by another role, transfer them once (`ALTER TABLE ... OWNER TO harper_admin` for every table).
- [x] The draft routes in `harper-pad-sync`: `GET /docs`, `GET /docs/<id>` and `PUT /docs/<id>` (compare-and-set, tombstones, the size
      limits), with tests for conflicts, deletes, limits, account isolation and concurrent writers (against PostgreSQL in `make test-db`).
- [ ] `GET` and `DELETE` for the device list the app shows (and the admin's revoke already works on the same table).
- [ ] The sync module (`lib/sync.js`) with unit tests.
- [ ] The end-to-end test (`docs/sync.md`, "End-to-end test"): a compose stack with PostgreSQL, `harper-pad-sync` built from
      `backend/Containerfile.sync`, and Caddy providing https (`app.localhost` serves the web build, `sync.localhost` proxies to the
      service), and a Playwright script with two browser contexts as devices. Checks: enrollment (and a spent invite), save pushes,
      Sync all and opening a note, a plain update, and the lose-the-server rebuild below. Needs the build-time sync origin for the CSP.
- [ ] A "lose the server" test in the end-to-end suite: wipe the server's database, re-enroll both devices and check that Sync all
      rebuilds identical drafts with no conflicted copies. A draft deleted elsewhere while a device was offline can reappear
      (documented), but nothing else is lost.
- [x] First slice of the UI (web build only): the status bar chip, the pop-up to paste an invite, and push after a save. Checked in
      Chromium against the compose stack. Desktop needs bindings for the sync state first.
- [ ] The rest of the UI: the device list, and the **Sync all** button in the drafts drawer (progress line, one-line summary, undoable
      removals, a "Newer on the server" marker on a note): follow `docs/design-cheatsheet.html`, short eased transitions, reduced
      motion honoured.
- [ ] Docs: `security.md` (opt-in network use, `connect-src`), `storage.md`, `architecture.md`, `pages.md`, `AGENTS.md`, and a server
      operations page.
