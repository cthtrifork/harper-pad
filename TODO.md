# TODO

Status: the editor (CodeMirror 6 + harper.js), Problems panel, Edit / Split / Preview views, updater, Windows release flow and web
build work, and so does the scratch pad drawer (autosave, search, delete with undo; SQLite on desktop, IndexedDB in the web build)
and Save as file.
Only open items are listed here; finished work is in the git history.

## 1. Cleanup and tests

- [ ] The frontend's only unit test is the `summarize` fixture test (`npm test`, Node's built-in runner). The drawer, `when.js`
      and the web drafts store were checked by driving the app; add tests for them.

## 2. Packaging and install on the homeserver

- [ ] Install route for homeserver-bootc: RPM from the release, or a `build_files/gui/` script like the Zed one.
- [ ] Verify the `.desktop` file, icon and `StartupWMClass` under KDE Wayland.
- [ ] Decide on self-update vs. image updates: on bootc `/usr` is read-only, so the in-app updater cannot replace the
      packaged binary (`selfupdate.Installable` should report it); likely disable it for the image install.

## 3. Windows

One release file, `harper-pad_windows_amd64.exe`; see `docs/windows.md`. Built by `release.yml` and started on a runner, but
never run on a real desktop yet.

- [ ] Try the exe on a real Windows 10/11 machine: window, fonts, HiDPI, then the updater (a newer release replacing the
      running exe).
- [ ] Code signing with SignPath Foundation: apply, create the project and policy, set `SIGNPATH_API_TOKEN` and
      `SIGNPATH_ORGANIZATION_ID` (`docs/windows.md`), add the code signing policy section to the README they ask for, and
      check the first signed release (`Get-AuthenticodeSignature`, SmartScreen). Until then the exe is unsigned.
- [ ] Windows tray icon (`internal/app/tray_other.go` is a no-op there).
- [ ] Optional later: winget or Scoop manifests.

## 4. Sync (proposal: `docs/sync.md`)

- [ ] **iPhone check for the device-bound key** (decides whether the device-bound key stays as designed). A throwaway page
      (`frontend/web/key-test.html`, PR #86, published as a pull request preview, not merged) checks it. **Done on 4 November 2026**
      on an iPhone, in a Safari tab and as a Home Screen app: key generation, storing only the private `CryptoKey`, `exportKey`
      refused, raw `r||s` signatures that verify against the saved public key, an HKDF data key and a derived AES-GCM key (for the encryption option), and
      Argon2id at 32, 64 and 128 MiB (about 0.1 to 0.2 s, no page kill). The keys survived closing and reopening the Home Screen
      app. `persist()` returned false. Results are recorded in `docs/sync.md`.
  - [ ] **Still to do:** open the Home Screen app again after a few hours, a day, a week and a phone restart, and look for "Key from
        an earlier run survived" and the history. If the key is cleared, use the rotation fallback described in `docs/sync.md`.
        Also open the test page in a browser on each desktop engine (GNOME Web or another WebKitGTK browser for the Linux window,
        Edge for the Windows window) and check the same results, because the desktop app keeps its key in the webview's IndexedDB
        with no OS keyring. Close PR #86 when the checks are done.
- [ ] Local groundwork: tombstones, `synced_hash` change tracking, an apply-remote store method, SQLite `user_version` 3 and IndexedDB
      `DB_VERSION` migrations, with tests.
- [ ] The server: `harper-pad-sync` (enrollment, sync, devices; every table carries `client_id`, one client account in v1), the `harper-pad-admin` Go + HTMX service (enrollment URLs,
      devices) behind a Cloudflare Tunnel and Access with OIDC (Cloudflare does all authentication; the app has none), two container
      images, and tests. The Kubernetes manifests are not kept in this repository; write them in the cluster's GitOps repository from
      the "Deploying the server" section of `docs/sync.md`: CloudNativePG `Cluster`, cert-manager certificates (database clients and
      the sync domain), the ingress route and middlewares for the sync API, NetworkPolicies, the admin pod with its `cloudflared`
      sidecar. Verify the CloudNativePG `pg_hba` certificate setup on a real cluster.
- [ ] The sync module (`lib/sync.js`) with unit tests.
- [ ] The end-to-end test (`docs/sync.md`, "End-to-end test"): a compose stack with PostgreSQL, `harper-pad-sync` built from
      `backend/Containerfile.sync`, and Caddy providing https (`app.localhost` serves the web build, `sync.localhost` proxies to the
      service), and a Playwright script with two browser contexts as devices. Checks: enrollment (and a spent invite), save pushes,
      Sync all and opening a note, a plain update, and the lose-the-server rebuild below. Needs the build-time sync origin for the CSP.
- [ ] A "lose the server" test in the end-to-end suite: wipe the server's database, re-enroll both devices and check that Sync all
      rebuilds identical drafts with no conflicted copies. A draft deleted elsewhere while a device was offline can reappear
      (documented), but nothing else is lost.
- [ ] The enrollment and status UI, and the **Sync all** button in the drafts drawer (progress line, one-line summary, undoable
      removals, a "Newer on the server" marker on a note): follow `docs/design-cheatsheet.html`, short eased transitions, reduced
      motion honoured.
- [ ] Docs: `security.md` (opt-in network use, `connect-src`), `storage.md`, `architecture.md`, `pages.md`, `AGENTS.md`, and a server
      operations page.
