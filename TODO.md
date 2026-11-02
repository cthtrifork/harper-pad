# TODO

Status: spike done on Chromium; scaffolding (CI, release, security, packaging, devcontainer, updater, MCP, pprof) ported
from trivy-dashboard-wail3 and not yet exercised on GitHub.

## 1. Spike: finish the open question (blocking everything else)

- [ ] On the homeserver: `make frontend && make run`; confirm both binaries (`inlined`, `url`) reach "ready" in WebKitGTK
      and record setup time and memory in `docs/spike.md`.
- [ ] If the `url` flavour fails, check the worker/wasm loading over the native asset scheme; if it works, drop the
      inlined variant (27 MB JS chunk).
- [ ] Decide: lazy-load harper.js after first paint (setup takes seconds) and show a "checking ready" state.

## 2. Repo and CI bring-up (first PR on GitHub)

- [ ] Create the GitHub repo (`cthtrifork/harper-pad`), push, enable Actions.
- [ ] Install the Renovate GitHub App and set the secrets/vars the workflows expect (see `docs/ci.md`,
      `docs/releasing.md`): `RELEASE_GPG_PRIVATE_KEY`, `RELEASE_GPG_PASSPHRASE`, Renovate app credentials.
- [ ] Branch rules: require `lint`, `test`, `build`, `check title`; enable immutable releases (`docs/releasing.md`).
- [ ] First green CI run; fix what the trivy-specific copies got wrong (workflows were only linted with
      actionlint/yamllint, never run).
- [ ] Dry-run `release.yml` on a branch (`workflow_dispatch`): confirm deb/rpm build with `harper-pad` names and the
      MCP/pprof grep checks pass.
- [ ] Swap the placeholder icons (`build/appicon.png`, `frontend/public/favicon.svg`, tray and window icons are still
      trivy art).
- [ ] `bindings.yml` from trivy (auto-updates stale bindings on PRs) was not ported; `ci.yml` only checks them. Port
      if wanted.
- [ ] Set the real Go version: `.tool-versions` and `go.mod` say 1.26 (what the VM has); trivy uses 1.27.

## 3. Docs audit

- [ ] `docs/ci.md`, `docs/releasing.md`, `docs/self-update.md` were trimmed by search and replace; read them end to end
      and remove references to files that do not exist here (`principles.md`, `architecture.md`, `headless.md`,
      `agent-runbook.md`, `decisions.md`).
- [ ] Write `docs/architecture.md` once the editor exists; link it from `AGENTS.md`.
- [ ] Decide whether the frontend gets an update banner (`PadService.UpdateInfo`, `CheckForUpdates`, `InstallUpdate`,
      `RestartToUpdate` exist and are bound; nothing calls them yet).

## 4. Editor (CodeMirror 6 + harper.js)

- [ ] Replace the spike textarea with a CodeMirror 6 editor (`@codemirror/view`, `state`, `lint`, markdown or plain text).
- [ ] `@codemirror/lint` source that calls `WorkerLinter.lint()` (debounced), maps `Lint.span()` to diagnostics and
      `suggestions()` to "apply" actions via `applySuggestion`; free wasm-backed `Lint` objects.
- [ ] Problems list (sidebar or panel) with jump-to and counts.
- [ ] Add word to a user dictionary and ignore a rule; persist both through `PadService`.
- [ ] Dialect/language setting (Harper config), persisted.
- [ ] Open/save files through Wails dialogs (Go side), dirty state, autosave of the current document.
- [ ] Light/dark theme from the existing CSS variables.

## 5. Scratch pad drawer

- [ ] Drawer component (model on trivy's `VexDrawer.vue`), toggle by shortcut and button.
- [ ] Notes storage in Go: JSON file under the user config dir, atomic write, tests.
- [ ] Multiple notes, search, delete with undo.
- [ ] "Send to editor" and "append selection to scratch pad".
- [ ] Decide whether the scratch pad text is also Harper-checked.

## 6. Packaging and install on the homeserver

- [ ] Install route for homeserver-bootc: RPM from the release, or a `build_files/gui/` script like the Zed one.
- [ ] Verify the `.desktop` file, icon and `StartupWMClass` under KDE Wayland.
- [ ] Decide on self-update vs. image updates: on bootc `/usr` is read-only, so the in-app updater cannot replace the
      packaged binary (`selfupdate.Installable` should report it); likely disable it for the image install.

## 7. Later / maybe

- [ ] Global shortcut or tray action to open a fresh scratch note.
- [ ] Spell-check languages other than English.
- [ ] Drop the Wails MCP/pprof dev code if never used.
