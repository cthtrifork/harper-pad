# TODO

Status: the editor (CodeMirror 6 + harper.js), Problems panel, Edit / Split / Preview views, updater, Windows release flow and web
build work, and so does the scratch pad drawer (autosave, search, delete with undo; SQLite on desktop, IndexedDB in the web build)
and Save as file. Open file is next.
Only open items are listed here; finished work is in the git history.

## 1. Repo and CI

- [ ] `go.mod` still says 1.26 while `.tool-versions` has 1.27.3. Left for Renovate's PR, because the VM cannot build with a
      newer one.
- [ ] Immutable releases (`docs/releasing.md`) could not be checked from the VM (token lacks access): confirm in the
      repo settings.

## 2. Docs audit

- [ ] `docs/ci.md`, `docs/releasing.md`, `docs/self-update.md` were trimmed by search and replace; read them end to end
      and remove references to files that do not exist here (`principles.md`, `architecture.md`, `headless.md`,
      `agent-runbook.md`, `decisions.md`).
- [ ] Write `docs/architecture.md` once the editor exists; link it from `AGENTS.md`.
- [ ] Optional later: a progress bar and a Cancel while downloading (needs Wails update events).

## 3. Checks only a real desktop can do

Everything below was tested in headless Chromium (the server build) and not in the real windows.

- [ ] The GTK window on Fedora: layout, fonts, HiDPI, Ctrl+J, the drafts drawer, the Problems panel, the update button.
- [ ] The Content-Security-Policy in WebKitGTK and WebView2 (`docs/security.md`): Harper (Web Worker and WebAssembly) must
      start. If it does not, the console names the violated directive; relaxing `'wasm-unsafe-eval'` is the only fix.
- [ ] A close right after typing keeps the last keystrokes (drafts save 500 ms after typing and on blur, hide and page hide).
- [ ] The update control (`components/UpdateButton.vue`) against a real release: needs a build with a release version, and on
      Windows an exe in a writable folder.
- [ ] The web build in Safari and on a phone: IndexedDB drafts, "Add to Home Screen", offline use (`docs/pages.md`).

## 4. Editor (CodeMirror 6 + harper.js)

Note: `harper-editor` and `lint-framework` are not on npm (only `harper.js` is), hence CodeMirror 6 rather than a
vendored Svelte editor. The wasm adds about 20 MB to the binary (8 MB gzipped).

- [ ] Turn a whole Harper rule off, not just one finding (needs `organizedLints` and `setLintConfig`); maybe in a settings screen.
- [ ] Document `format`: files by extension (`.md`, `.markdown` are markdown, unknown files open as text) once "Open file" exists.
      (Drafts store the format, new drafts are markdown, and the status bar "Markdown" label is a menu to switch it.)
- [ ] Dirty state for a document that was opened from a file (see "Save as file" and "Open file" below).

## 5. Scratch pad drawer (drafts)

Design: the UI mockups in the "Harper Pad UI" canvas (editor, problems hidden, split, preview, scratch pad drawer).

- [ ] "Open file" (Ctrl+O; there is no button yet), on desktop through the Go service (`application.Get().Dialog.OpenFile()` with filters), in the web
      build through the browser's file picker. Report results inline, not with info dialogs.
- [ ] Export and import all drafts as one JSON file, as a manual backup. It matters most for the web build, where the browser
      can evict its storage, and it is also the only way to move drafts between the web app and the desktop app.
- [ ] "Send to editor" and "Add to scratch pad" for the current selection (a small button that appears over the selection in
      the editor).
- [ ] Search on desktop folds the case of ASCII letters only (SQLite's `LIKE`; the web build folds every letter). An FTS5 index
      (`unicode61`) would fix that and keep search quick on a very large collection.

## 6. Cleanup and tests

- [ ] `summarize` (title, excerpt, task preview) exists twice, in `internal/store/drafts.go` and `frontend/src/lib/summarize.js`,
      and must stay the same. Share one file of fixtures that both test suites run, so they cannot drift.
- [ ] The frontend has no unit tests (the drawer, `summarize.js`, `when.js` and the web drafts store were checked by driving the
      app). Add Vitest for them.
- [ ] `PadService` holds the updater, the drafts and the settings. Wails' binding guidance prefers focused services
      (`UpdateService`, `DraftService`, `SettingsService`); optional.

## 7. Packaging and install on the homeserver

- [ ] Install route for homeserver-bootc: RPM from the release, or a `build_files/gui/` script like the Zed one.
- [ ] Verify the `.desktop` file, icon and `StartupWMClass` under KDE Wayland.
- [ ] Decide on self-update vs. image updates: on bootc `/usr` is read-only, so the in-app updater cannot replace the
      packaged binary (`selfupdate.Installable` should report it); likely disable it for the image install.

## 8. Windows

One release file, `harper-pad_windows_amd64.exe`; see `docs/windows.md`. Built by `release.yml` and started on a runner, but
never run on a real desktop yet.

- [ ] Try the exe on a real Windows 10/11 machine: window, fonts, HiDPI, then the updater (a newer release replacing the
      running exe).
- [ ] Code signing with SignPath Foundation: apply, create the project and policy, set `SIGNPATH_API_TOKEN` and
      `SIGNPATH_ORGANIZATION_ID` (`docs/windows.md`), add the code signing policy section to the README they ask for, and
      check the first signed release (`Get-AuthenticodeSignature`, SmartScreen). Until then the exe is unsigned.
- [ ] Windows tray icon (`internal/app/tray_other.go` is a no-op there).
- [ ] Optional later: winget or Scoop manifests.

## 9. Later / maybe

- [ ] Global shortcut or tray action to open a fresh scratch note.
- [ ] Spell-check languages other than English.
- [ ] Drop the Wails MCP/pprof dev code if never used.
