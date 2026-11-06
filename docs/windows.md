# Windows

Harper Pad runs on Windows 10 and 11 (64-bit Intel/AMD). The release has two Windows files:

| File | Notes |
|---|---|
| `harper-pad_<version>_windows_amd64_installer.exe` | the installer (NSIS). Installs for the current user, no administrator prompt, with Start menu and desktop shortcuts and an entry in *Settings → Apps*. |
| `harper-pad_windows_amd64.exe` | the app on its own, for people who do not want an installer. It is also what the in-app updater installs. |

## Installing

Download the installer from the release and run it. It puts Harper Pad in `%LOCALAPPDATA%\Programs\Harper Pad`, adds the
shortcuts, and downloads the WebView2 runtime if the PC lacks it. Silent install for scripts: `installer.exe /S`, with
`/D=C:\some\folder` last to choose the folder. Uninstall from *Settings → Apps* or `uninstall.exe` in the install folder; your
drafts and settings (`%LOCALAPPDATA%\harper-pad`) stay.

The install is per user on purpose: the in-app updater saves the new version over the installed exe, which needs a folder
you can write to, and `C:\Program Files` is not one. The version shown in *Settings → Apps* stays at the installed one after
the app updates itself; the app's own version button shows the real one.

## Running the exe without the installer

Download `harper-pad_windows_amd64.exe` and double-click it. Keep it in a folder you can write to (your user folder, not
`C:\Program Files`), for the same reason. Pin it to the taskbar or make a shortcut for a Start menu entry.

## Code signing

Windows SmartScreen shows "Windows protected your PC" for an exe that is not signed (**More info → Run anyway**). The
release workflow signs the exe through [SignPath Foundation](https://signpath.org/), which signs open-source projects for
free. It is switched on by repository settings, so until they exist the exe is released **unsigned** (the workflow logs
a warning):

1. Apply to SignPath Foundation for the project (an account that only the repository owner can create). Follow their
   instructions for what the project has to publish (they ask for a code signing policy in the README).
2. In SignPath, create the project and a signing policy, and connect it to this repository's GitHub Actions. The
   artifact configuration is a zip with the exe at its root: `harper-pad_windows_amd64.exe`, signed as a PE file.
3. In the repository (Settings → Secrets and variables → Actions) set:
   - secret `SIGNPATH_API_TOKEN`: the API token of a SignPath user that may submit signing requests;
   - variable `SIGNPATH_ORGANIZATION_ID`: the organisation id (this variable switches signing on);
   - variables `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_SIGNING_POLICY_SLUG` if they are not `harper-pad` and
     `release-signing`.

The installer is built from the signed exe, but the installer file itself is **not signed yet**: signing it needs a second file in the
SignPath artifact configuration (an `Installer` entry beside the exe), which is a setting on SignPath's side. Until then SmartScreen
may warn when the installer is run.

`release.yml` then uploads the unsigned exe, waits for SignPath, puts the signed exe in `dist/` and fails the release unless
`Get-AuthenticodeSignature` says `Valid`. `SHA256SUMS` and the attestations are made afterwards, so they cover the signed
file. Dry runs never sign.

A signed exe from a new publisher can still trigger SmartScreen warnings for a while, until Windows has seen enough
downloads. Besides the signature you can check `SHA256SUMS` and the GitHub attestation:
`gh attestation verify harper-pad_windows_amd64.exe --repo cthtrifork/harper-pad` (see
[releasing](releasing.md#verifying-a-release)).

## WebView2

The window is Microsoft's WebView2 (Edge). Windows 11 and current Windows 10 have the runtime. Without it the app shows
Wails' prompt to install it.

## How it is built

`scripts/package-windows.sh <version> <out-dir>`:

1. `wails3 generate syso` turns `build/windows/icon.ico`, `wails.exe.manifest` and `info.json` (version filled in from the
   tag) into a resource file that `go build` links into the exe: icon, DPI awareness, version information.
2. `go build` with `CGO_ENABLED=0 GOOS=windows -tags production -ldflags "-H windowsgui ..."`. Windows needs no cgo or GUI
   libraries, so the exe can be built on Linux too.

`scripts/package-windows-installer.sh <version> <exe> <out-dir>` follows the Wails v3
[Windows packaging guide](https://v3.wails.io/guides/build/windows/) (NSIS, the default format): it fetches the WebView2 bootstrapper
(`wails3 generate webview2bootstrapper`) and runs `makensis` on `build/windows/nsis/project.nsi`, the template
`wails3 generate build-assets` writes, trimmed and set to a per-user install (`WAILS_INSTALL_SCOPE=user`). The repo does not use the
generated Taskfile, so the script replaces `wails3 package`. `scripts/check-windows-installer.sh` installs the result silently into a
scratch folder, checks the exe is there, uninstalls and checks it is gone. MSIX, the guide's other format, is not built.

`release.yml` runs this on a Windows runner, signs the result (above), starts it and checks it stays up for 20 seconds
before anything is published, then builds the installer from it and runs the install check. `ci.yml` has a `windows` job (vet, tests, the exe build and the installer with its check) on every pull request.

## Differences from Linux

- No tray icon yet (`internal/app/tray_other.go` is a no-op on Windows).
- The window background follows the system theme, as on Linux.
- Settings and drafts live in `%LOCALAPPDATA%\harper-pad\harper-pad.db` (see [storage](storage.md)).

## Not tested here

The Linux sandbox that wrote this could cross-compile the exe but not run it, and had no NSIS, so the installer script, `project.nsi` and the install check were never run here: their first run is the `windows` CI job. What was exercised: the cross-build, `go vet`
for Windows, and the build and start check on GitHub's Windows runner. Running the app on a real desktop (window, fonts,
HiDPI, the updater replacing a running exe) and the SignPath step have to be tried by hand.
