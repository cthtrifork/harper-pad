#!/usr/bin/env bash
# Build the Windows release exe from a built frontend (frontend/dist).
#
#   scripts/package-windows.sh <version> <out-dir>
#
# Writes <out-dir>/harper-pad_windows_amd64.exe: the one Windows file the release ships, and the one the in-app
# updater installs (see docs/self-update.md; the name is an interface). Runs on a Windows runner (Git Bash) and on
# Linux too, because the Windows GUI build needs no cgo. Needs the wails3 CLI on PATH.
set -euo pipefail

version="${1:?usage: package-windows.sh <version> <out-dir>}"
out="${2:?usage: package-windows.sh <version> <out-dir>}"

app=harper-pad
module=github.com/cthtrifork/harper-pad
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
mkdir -p "$out"
out="$(cd "$out" && pwd)"

# Git Bash on Windows rewrites arguments that look like POSIX paths, and native tools (wails3, go) need Windows
# paths. Convert the ones we pass explicitly and switch the automatic rewriting off.
export MSYS_NO_PATHCONV=1
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -m "$1"; else printf '%s' "$1"; fi; }

# Windows version resources want numeric x.y.z. A tag like v1.2.3-rc.1 becomes 1.2.3, and a dry run
# (v0.0.0-dryrun.abc1234) becomes 0.0.0.
numeric="${version#v}"
numeric="${numeric%%-*}"
case "$numeric" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) numeric=0.0.0 ;;
esac

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
  -o "$(native "$out")/${app}_windows_amd64.exe" .

ls -la "$out"
