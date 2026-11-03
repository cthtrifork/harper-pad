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

- [ ] **iPhone check for the device-bound key** (decides whether v1.1 hardening goes ahead as written). Chromium was checked
      (a non-extractable ECDSA P-256 key stored in IndexedDB survived a reload, could not be exported and signed correctly);
      WebKit and the installed Home Screen app were not. Build a throwaway page (not merged; serve it from a scratch branch on
      Pages or any HTTPS host) that:
  1. generates a non-extractable ECDSA P-256 key, stores **only the private `CryptoKey`** in IndexedDB and shows the public JWK;
  2. after a reload, loads the key, confirms `extractable` is false and `exportKey` throws, signs a fixed message and checks
     the signature against the JWK (raw `r‖s`, 64 bytes);
  3. calls `navigator.storage.persist()` and reports the result;
  4. for v2: imports 32 random bytes as a non-extractable HKDF key, stores that handle, and after a reload derives an AES-GCM
     key from it, encrypts and decrypts a string; and runs Argon2id (WebAssembly, 64 MiB, 3 passes) in a worker, recording the
     time and whether the app survives (try 32 and 128 MiB as well).

  Run it in Safari and as an installed Home Screen app (add the icon first, then run it from the icon), on the current iOS. Record
  in `docs/sync.md` whether each step passes, then repeat after the app has been closed for a day, a week, and after an iOS
  restart, to see whether the key is cleared. If it fails or is cleared often, use the rotation fallback described there.
- [ ] Local groundwork: tombstones, dirty tracking, an apply-remote store method, SQLite `user_version` 3 and IndexedDB
      `DB_VERSION` migrations, with tests.
- [ ] The server (`harper-pad-sync`): enrollment, sync, devices, history, the CLI, tests. Decide whether it lives in this repository
      (see the open questions in `docs/sync.md`).
- [ ] The sync module (`lib/sync.js`) with unit tests and an end-to-end test against the real server.
- [ ] The enrollment and status UI: follow `docs/design-cheatsheet.html`, short eased transitions, reduced motion honoured.
- [ ] Docs: `security.md` (opt-in network use, `connect-src`), `storage.md`, `architecture.md`, `pages.md`, `AGENTS.md`, and a server
      operations page.
- [ ] v2, end-to-end encryption (`docs/sync.md`, "v2"): after v1 is in use. `lib/crypto.js` with shared test vectors, the
      Argon2id worker, key bag endpoints, envelope validation and `purge-plaintext` on the server, and the setup, unlock,
      change-passphrase and rotate-key screens.
