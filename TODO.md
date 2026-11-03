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
