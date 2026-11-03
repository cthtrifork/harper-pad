# Windows

Harper Pad runs on Windows 10 and 11 (64-bit Intel/AMD). The release has one Windows file:

| File | Notes |
|---|---|
| `harper-pad_windows_amd64.exe` | the app. Put it anywhere you can write to and run it. It is also what the in-app updater installs. |

There is no installer and no zip: the exe is the whole program (the frontend and the grammar checker are inside it). That
also keeps signing simple, because there is only one file to sign.

## Running it

Download `harper-pad_windows_amd64.exe` from the release and double-click it. Keep it in a folder you can write to (your
user folder, not `C:\Program Files`): the updater saves the new version next to the old one. Pin it to the taskbar or make
a shortcut for a Start menu entry.

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

`release.yml` runs this on a Windows runner, signs the result (above), starts it and checks it stays up for 20 seconds
before anything is published. `ci.yml` has a `windows` job (vet, tests and the exe build) on every pull request.

## Differences from Linux

- No tray icon yet (`internal/app/tray_other.go` is a no-op on Windows).
- The window background follows the system theme, as on Linux.
- Settings and drafts live in `%LOCALAPPDATA%\harper-pad\harper-pad.db` (see [storage](storage.md)).

## Not tested here

The Linux sandbox that wrote this could cross-compile the exe but not run it. What was exercised: the cross-build, `go vet`
for Windows, and the build and start check on GitHub's Windows runner. Running the app on a real desktop (window, fonts,
HiDPI, the updater replacing a running exe) and the SignPath step have to be tried by hand: see `TODO.md`.
