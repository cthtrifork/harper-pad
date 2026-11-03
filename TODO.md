# TODO

Status: the editor (CodeMirror 6 + harper.js), Problems panel, updater and Windows release flow work. The drafts drawer,
markdown preview and file open/save are next. Only open items are listed here; finished work is in the git history.

## 1. Repo and CI

- [ ] Set the real Go version: `.tool-versions` and `go.mod` say 1.26 (what the VM has). Left for Renovate's PR,
      because the VM cannot build with a newer one.
- [ ] Immutable releases (`docs/releasing.md`) could not be checked from the VM (token lacks access): confirm in the
      repo settings.

## 2. Docs audit

- [ ] `docs/ci.md`, `docs/releasing.md`, `docs/self-update.md` were trimmed by search and replace; read them end to end
      and remove references to files that do not exist here (`principles.md`, `architecture.md`, `headless.md`,
      `agent-runbook.md`, `decisions.md`).
- [ ] Write `docs/architecture.md` once the editor exists; link it from `AGENTS.md`.
- [ ] Try the update control (`components/UpdateButton.vue`) against a real release: needs a build with a release
      version, and on Windows an exe in a writable folder.
- [ ] Optional later: a progress bar and a Cancel while downloading (needs Wails update events).

## 3. Editor (CodeMirror 6 + harper.js)

Note: `harper-editor` and `lint-framework` are not on npm (only `harper.js` is), hence CodeMirror 6 rather than a
vendored Svelte editor. The wasm adds about 20 MB to the binary (8 MB gzipped).

- [ ] Suggestion popover on the underlined issue: replacements work (CodeMirror's lint tooltip); "Add to dictionary" and
      "Ignore this rule" are still missing, and the tooltip is only themed with colours.
- [ ] Problems panel: filter chips and counts per kind. (The panel, jump-to, first fix and the toolbar toggle exist.)
- [ ] View switch Edit / Split / Preview, available whenever the scratch pad is closed. Split shows the markdown
      source left and the rendered preview right; Preview uses the whole window. The preview is read-only and
      follows the editor's scroll. Only shown for markdown (see below).
- [ ] Document `format` (`markdown` or `text`): files by extension (`.md`, `.markdown`), drafts store it, default
      markdown for new drafts, unknown files open as text. The status bar "Markdown" label is a menu to switch it.
      A plain-text draft that looks like markdown gets a "Looks like Markdown. Switch?" hint, never an automatic switch.
- [ ] Add word to a user dictionary and ignore a rule; persist both through `PadService`.
- [ ] Dialect/language setting (Harper config), persisted.
- [ ] Open/save files through Wails dialogs (Go side), dirty state. "Save as file" on a draft suggests `.md` or `.txt`.
- [ ] Light/dark theme from the existing CSS variables.

## 4. Scratch pad drawer (drafts)

Design: the UI mockups in the "Harper Pad UI" canvas (editor, problems hidden, split, preview, scratch pad drawer).

- [ ] Drawer on the left, toggled by Ctrl+J and the first toolbar button. While it is
      open only the Edit view is available (Split and Preview are disabled with a hint).
- [ ] Drafts are stored by the app, not as files: JSON under the user config dir, atomic write, autosave as you type,
      tests. Nothing reaches the file system until "Save as file". A draft is `id` (UUID or ULID, not a timestamp: two
      drafts in one second would collide), `title`, `content`, `format`, `createdAt`, `updatedAt`, all lowercase JSON
      tags so the frontend can read them.
- [ ] Debounced save to Go (about 500 ms after the last keystroke, separate from the 300 ms lint), plus a save on blur
      and on window close so the last keystrokes are never lost. Show "Saved" and the last updated time in the status bar.
- [ ] Recent drafts list: title, last touched, and a preview. Markdown task lines (`- [ ]`, `- [x]`) show as up to
      three checkbox lines with "N of M tasks done"; drafts without tasks show a two-line excerpt.
- [ ] New draft (focus the editor straight away), search, "Older drafts", delete with an undo toast (the webview has no
      working `confirm()`), and "Save as file" to promote a draft. Title comes from the first line, with "Untitled" and a
      "No drafts yet" empty state.
- [ ] "Save as file" and "Open file" through the Go service: `application.Get().Dialog.SaveFile()` / `OpenFile()` with a
      filename and filters (`.md` or `.txt` from the draft's format). Report results inline, not with info dialogs.
- [ ] Export and import all drafts as one JSON file, as a manual backup.
- [ ] "Send to editor" and "Add to scratch pad" for the current selection.
- [ ] Never render draft text with `v-html` (the Wails notes tutorial writes it into `innerHTML` unescaped).
- [ ] Decide whether draft text is also Harper-checked (the mockup checks the open draft in the editor).

## 5. Packaging and install on the homeserver

- [ ] Install route for homeserver-bootc: RPM from the release, or a `build_files/gui/` script like the Zed one.
- [ ] Verify the `.desktop` file, icon and `StartupWMClass` under KDE Wayland.
- [ ] Decide on self-update vs. image updates: on bootc `/usr` is read-only, so the in-app updater cannot replace the
      packaged binary (`selfupdate.Installable` should report it); likely disable it for the image install.

## 6. Windows

One release file, `harper-pad_windows_amd64.exe`; see `docs/windows.md`. Built by `release.yml` and started on a runner, but
never run on a real desktop yet.

- [ ] Try the exe on a real Windows 10/11 machine: window, fonts, HiDPI, then the updater (a newer release replacing the
      running exe).
- [ ] Code signing with SignPath Foundation: apply, create the project and policy, set `SIGNPATH_API_TOKEN` and
      `SIGNPATH_ORGANIZATION_ID` (`docs/windows.md`), add the code signing policy section to the README they ask for, and
      check the first signed release (`Get-AuthenticodeSignature`, SmartScreen). Until then the exe is unsigned.
- [ ] Windows tray icon (`internal/app/tray_other.go` is a no-op there).
- [ ] Optional later: winget or Scoop manifests.

## 7. Later / maybe

- [ ] Global shortcut or tray action to open a fresh scratch note.
- [ ] Spell-check languages other than English.
- [ ] Drop the Wails MCP/pprof dev code if never used.
