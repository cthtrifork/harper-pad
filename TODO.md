# TODO

Status: spike done on Chromium and WebKitGTK (Fedora release build); scaffolding (CI, release, security, packaging, devcontainer, updater, MCP, pprof) ported
from trivy-dashboard-wail3 and not yet exercised on GitHub.

## 1. Spike: finish the open question (blocking everything else)

- [x] Run a release build on Fedora (WebKitGTK 2.x, UA `Version/60.5 Safari/605.1.15`): both binaries reach "ready"
      and find the 4 expected issues. Setup 589 ms, lint 48 ms (inlined: 778 ms, 55 ms). Memory was not measured.
- [x] The `url` flavour works over the native asset scheme (worker and wasm both load).
- [x] Drop the `inlined` variant and the flavour selector: use `harper.js/slimBinary` only (avoids the 27 MB JS chunk).
- [x] Lazy-load harper.js after first paint: not needed for the spike, setup is under 1 s. Revisit when the editor
      exists (still show a "checking" state until the worker is ready).

## 2. Repo and CI bring-up (first PR on GitHub)

- [x] Create the GitHub repo (`cthtrifork/harper-pad`), push, enable Actions.
- [x] Install the Renovate GitHub App and set the secrets/vars the workflows expect (`RENOVATE_APP_CLIENT_ID` is set,
      and the signed `v0.0.1` release shows the GPG key works).
- [x] Branch rules: `main` requires a PR and `lint`, `test`, `build`, `check title`, and blocks deletion and force
      pushes. Immutable releases (`docs/releasing.md`) could not be checked from the VM (token lacks access): confirm
      in the repo settings.
- [x] First green CI run, and a `release.yml` dry run (`v0.0.1`: deb, rpm, tarball, SBOM, checksums, signing key).
- [x] Swap the placeholder icons (`build/appicon.png`, `frontend/public/favicon.svg`, tray and window icons): new
      amber "H with a squiggle" icon, rendered from the SVG.
- [x] `bindings.yml` from trivy: not ported on purpose; `ci.yml` checks the bindings and the repo has one service.
- [ ] Set the real Go version: `.tool-versions` and `go.mod` say 1.26 (what the VM has); trivy uses 1.27. Left for
      Renovate's PR, because the VM cannot build with 1.27.

## 3. Docs audit

- [ ] `docs/ci.md`, `docs/releasing.md`, `docs/self-update.md` were trimmed by search and replace; read them end to end
      and remove references to files that do not exist here (`principles.md`, `architecture.md`, `headless.md`,
      `agent-runbook.md`, `decisions.md`).
- [ ] Write `docs/architecture.md` once the editor exists; link it from `AGENTS.md`.
- [x] Update control in the top bar (`components/UpdateButton.vue`): check, download, restart, all on click. Not tried
      against a real release yet (needs a build with a release version, and on Windows an exe in a writable folder).
- [ ] Optional later: a progress bar and a Cancel while downloading (needs Wails update events).

## 4. Editor (CodeMirror 6 + harper.js)

Note: `harper-editor` and `lint-framework` are not on npm (only `harper.js` is), hence CodeMirror 6 rather than a
vendored Svelte editor. The wasm adds about 20 MB to the binary (8 MB gzipped).

- [x] Replace the spike textarea with a CodeMirror 6 editor (plain text for now; markdown highlighting comes with the views).
- [x] `@codemirror/lint` source that calls `WorkerLinter.lint()` (debounced), maps `Lint.span()` to diagnostics and
      `suggestions()` to "apply" actions via `applySuggestion`; free wasm-backed `Lint` objects.
- [x] Suggestion popover on the underlined issue: replacements, "Add to dictionary" (spelling) and "Ignore this one". Turning
      a whole rule off is not built (needs `organizedLints` and `setLintConfig`); maybe in a settings screen.
- [ ] Problems panel on the right (Edit view only) with filter chips, counts and jump-to. A "Problems" toolbar toggle
      hides it and the editor uses the full width; the count stays on the toggle and in the status bar.
- [ ] View switch Edit / Split / Preview, available whenever the scratch pad is closed. Split shows the markdown
      source left and the rendered preview right; Preview uses the whole window. The preview is read-only and
      follows the editor's scroll. Only shown for markdown (see below).
- [ ] Document `format` (`markdown` or `text`): files by extension (`.md`, `.markdown`), drafts store it, default
      markdown for new drafts, unknown files open as text. The status bar "Markdown" label is a menu to switch it.
      A plain-text draft that looks like markdown gets a "Looks like Markdown. Switch?" hint, never an automatic switch.
- [x] Personal dictionary and ignored findings, saved through `PadService` into the same SQLite database (`docs/storage.md`).
- [ ] A way to see and remove dictionary words and ignored findings (the Problems panel only shows the counts).
- [ ] Dialect/language setting (Harper config), persisted.
- [ ] Open/save files through Wails dialogs (Go side), dirty state. "Save as file" on a draft suggests `.md` or `.txt`.
- [ ] Light/dark theme from the existing CSS variables.

## 5. Scratch pad drawer (drafts)

Design: the UI mockups in the "Harper Pad UI" canvas (editor, problems hidden, split, preview, scratch pad drawer).

- [ ] Drawer on the left, toggled by Ctrl+J and the first toolbar button (model on trivy's `VexDrawer.vue`). While it is
      open only the Edit view is available (Split and Preview are disabled with a hint).
- [x] Drafts are stored by the app, not as files: one SQLite file with id, timestamps and a JSON blob per draft, atomic,
      with a `format` and ids that sort by creation (`internal/store`, `docs/storage.md`). Nothing reaches the file system
      until "Save as file".
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

## 6. Packaging and install on the homeserver

- [ ] Install route for homeserver-bootc: RPM from the release, or a `build_files/gui/` script like the Zed one.
- [ ] Verify the `.desktop` file, icon and `StartupWMClass` under KDE Wayland.
- [ ] Decide on self-update vs. image updates: on bootc `/usr` is read-only, so the in-app updater cannot replace the
      packaged binary (`selfupdate.Installable` should report it); likely disable it for the image install.

## 6b. Windows

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
