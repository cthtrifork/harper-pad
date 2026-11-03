# Windows

Harper Pad runs on Windows 10 and 11 (64-bit Intel/AMD). The release has three Windows files:

| File | For | Notes |
|---|---|---|
| `harper-pad_<version>_windows_amd64_installer.exe` | most people | per-user install, no administrator prompt |
| `harper-pad_<version>_windows_amd64.zip` | portable use | `harper-pad.exe`, README and LICENSE; extract anywhere |
| `harper-pad_windows_amd64.exe` | the in-app updater | the raw exe; people can run it too |

## Install

Run the installer. It installs to `%LOCALAPPDATA%\Programs\Harper Pad`, adds a Start menu entry and an entry in
**Settings → Apps** for uninstalling. For a silent install (scripts, testing): `installer.exe /S`.

It installs per user on purpose: the in-app updater stages the new exe next to the old one, so the folder has to be
writable without administrator rights. A copy under `C:\Program Files` could not update itself.

## Not signed yet

The files are **not Authenticode-signed**, so Windows SmartScreen may show "Windows protected your PC" on the first run
(choose **More info → Run anyway**). Signing needs a code-signing certificate, which the project does not have. What you
can check instead is in [releasing](releasing.md#verifying-a-release): `SHA256SUMS`, and signed GitHub attestations for
every Windows file (`gh attestation verify <file> --repo cthtrifork/harper-pad`).

## WebView2

The window is Microsoft's WebView2 (Edge). Windows 11 and current Windows 10 have the runtime. The installer checks and,
if it is missing, installs it with Microsoft's bootstrapper (bundled into the installer, so it needs no extra download).
The zip does not install anything: without the runtime the app shows Wails' prompt to install it.

## How it is built

`scripts/package-windows.sh <version> <out-dir>`:

1. `wails3 generate syso` turns `build/windows/icon.ico`, `wails.exe.manifest` and `info.json` (version filled in from the
   tag) into a resource file that `go build` links into the exe: icon, DPI awareness, version information.
2. `go build` with `CGO_ENABLED=0 GOOS=windows -tags production -ldflags "-H windowsgui ..."`. Windows needs no cgo or GUI
   libraries, so the exe can be built on Linux too: `scripts/package-windows.sh v1.2.3 dist --no-installer`.
3. The zip, and the installer from `build/windows/nsis/project.nsi` with `makensis` (adapted from the Wails v3 example
   installer; the `wails_tools.nsh` next to it is the Wails one).

`release.yml` runs this on a Windows runner and tries the installer; `ci.yml` has a `windows` job (vet, tests and the exe/zip).

## Differences from Linux

- No tray icon yet (`internal/app/tray_other.go` is a no-op on Windows).
- The window background follows the system theme, as on Linux.
- Settings and drafts will live under `%APPDATA%` (the user config dir) when they exist.

## Not tested here

The Linux sandbox that wrote this could cross-compile the exe but not run it. What was exercised: the cross-build, `go vet`
for Windows, and the release workflow's Windows job on GitHub's runner. Running the app on a real desktop (window,
fonts, HiDPI, the updater replacing a running exe) has to be done by hand: see the checklist in `TODO.md`.
