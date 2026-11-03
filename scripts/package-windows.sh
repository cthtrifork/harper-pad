#!/usr/bin/env bash
# Build the Windows release files from a built frontend (frontend/dist).
#
#   scripts/package-windows.sh <version> <out-dir> [--no-installer]
#
# Writes to <out-dir>:
#   harper-pad_windows_amd64.exe                          the raw binary, which the in-app updater installs
#   harper-pad_<version>_windows_amd64.zip                binary + README.md + LICENSE, for people
#   harper-pad_<version>_windows_amd64_installer.exe      per-user NSIS installer (skipped with --no-installer, or
#                                                         ); it needs the NSIS tool makensis
#
# The names are an interface: see docs/self-update.md. The installer's name contains "_installer." on purpose, so
# the updater's default matcher never picks it. Runs on a Windows runner (Git Bash) and, without the installer, on
# Linux too, because the GUI build for Windows needs no cgo.
set -euo pipefail

version="${1:?usage: package-windows.sh <version> <out-dir> [--no-installer]}"
out="${2:?usage: package-windows.sh <version> <out-dir> [--no-installer]}"
installer=true
[ "${3:-}" = "--no-installer" ] && installer=false

app=harper-pad
module=github.com/cthtrifork/harper-pad
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

# Windows version resources want numeric x.y.z. A tag like v1.2.3-rc.1 becomes 1.2.3, and a dry run
# (v0.0.0-dryrun.abc1234) becomes 0.0.0.
numeric="${version#v}"
numeric="${numeric%%-*}"
case "$numeric" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) numeric=0.0.0 ;;
esac

# Git Bash on Windows rewrites arguments that look like POSIX paths, and native tools (wails3, go, makensis) need
# Windows paths. Convert the ones we pass explicitly and switch the automatic rewriting off.
export MSYS_NO_PATHCONV=1
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

work="$(mktemp -d)"
trap 'rm -rf "$work" wails_windows_amd64.syso' EXIT

# Icon, manifest and version information go into the executable as a .syso resource that `go build` links.
sed "s/0\.0\.0/$numeric/g" build/windows/info.json > "$work/info.json"
wails3 generate syso -arch amd64 \
  -icon build/windows/icon.ico \
  -manifest build/windows/wails.exe.manifest \
  -info "$(native "$work")/info.json" \
  -out "$(native "$root")/wails_windows_amd64.syso"

# CGO is off: the Windows build talks to WebView2 without C code. -H windowsgui keeps a console window from opening.
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -tags production -trimpath -buildvcs=false \
  -ldflags "-w -s -H windowsgui -X $module/internal/app.version=$version" \
  -o "$(native "$work")/$app.exe" .

cp "$work/$app.exe" "$out/${app}_windows_amd64.exe"

# The zip holds the binary, README and LICENSE (people extract it anywhere; the updater never reads it).
stage="$work/zip"
mkdir -p "$stage"
cp "$work/$app.exe" README.md LICENSE "$stage/"
zip_out="$out/${app}_${version}_windows_amd64.zip"
rm -f "$zip_out"
if command -v zip >/dev/null 2>&1; then
  (cd "$stage" && zip -q "$zip_out" "$app.exe" README.md LICENSE)
elif command -v 7z >/dev/null 2>&1; then
  (cd "$stage" && 7z a -tzip -bso0 "$(native "$zip_out")" "$app.exe" README.md LICENSE)
elif command -v python3 >/dev/null 2>&1; then
  (cd "$stage" && python3 -c 'import sys, zipfile
with zipfile.ZipFile(sys.argv[1], "w", zipfile.ZIP_DEFLATED) as z:
    for name in sys.argv[2:]:
        z.write(name)' "$zip_out" "$app.exe" README.md LICENSE)
else
  echo "no zip, 7z or python3 found to make the zip" >&2; exit 1
fi

if [ "$installer" = true ]; then
  wails3 generate webview2bootstrapper -dir "$(native "$root")/build/windows/nsis"
  (cd build/windows/nsis && makensis -V2 \
    -DARG_WAILS_AMD64_BINARY="$(native "$work")/$app.exe" \
    -DINFO_PRODUCTVERSION="$numeric" \
    -DOUTFILE="$(native "$out")/${app}_${version}_windows_amd64_installer.exe" \
    project.nsi)
fi
ls -la "$out"
