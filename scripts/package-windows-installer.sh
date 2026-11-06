#!/usr/bin/env bash
# Build the Windows installer (NSIS, per-user) around the release exe, as the Wails v3 Windows packaging guide describes
# (https://v3.wails.io/guides/build/windows/): the WebView2 bootstrapper from `wails3 generate webview2bootstrapper`
# and makensis on build/windows/nsis/project.nsi.
#
#   scripts/package-windows-installer.sh <version> <exe> <out-dir>
#
# Writes <out-dir>/harper-pad_<version>_windows_amd64_installer.exe. The "_installer.exe" ending keeps the in-app updater from
# taking it for the raw exe (internal/selfupdate). Run it after the exe is signed, so the installer carries the signed file.
# Needs the wails3 CLI and makensis (NSIS) on PATH; Linux works too if NSIS is installed.
set -euo pipefail

version="${1:?usage: package-windows-installer.sh <version> <exe> <out-dir>}"
exe="${2:?usage: package-windows-installer.sh <version> <exe> <out-dir>}"
out="${3:?usage: package-windows-installer.sh <version> <exe> <out-dir>}"

app=harper-pad
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
exe="$(cd "$(dirname "$exe")" && pwd)/$(basename "$exe")"
[ -f "$exe" ] || { echo "package-windows-installer: $exe is not a file" >&2; exit 1; }

# Git Bash rewrites arguments that look like POSIX paths (makensis flags start with a slash), so switch that off and
# hand native tools Windows paths.
export MSYS_NO_PATHCONV=1
native() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

# GitHub's Windows runners ship NSIS but do not always put it on PATH.
if ! command -v makensis >/dev/null 2>&1; then
  for dir in "/c/Program Files (x86)/NSIS" "/c/Program Files/NSIS"; do
    [ -x "$dir/makensis.exe" ] && PATH="$dir:$PATH" && break
  done
fi
command -v makensis >/dev/null || { echo "package-windows-installer: makensis not found (install NSIS)" >&2; exit 1; }
command -v wails3 >/dev/null || { echo "package-windows-installer: wails3 not on PATH (make wails3-install)" >&2; exit 1; }

# The installer's version resources want numeric x.y.z (v1.2.3-rc.1 and a dry run become 1.2.3 and 0.0.0).
numeric="${version#v}"
numeric="${numeric%%-*}"
case "$numeric" in
  [0-9]*.[0-9]*.[0-9]*) ;;
  *) numeric=0.0.0 ;;
esac

# project.nsi installs this into the user's profile and fetches the WebView2 runtime when it is missing, using the
# bootstrapper below (a small file Microsoft serves; it is git-ignored).
wails3 generate webview2bootstrapper -dir "$(native "$root/build/windows/nsis")"

target="$out/${app}_${version}_windows_amd64_installer.exe"
(
  cd build/windows/nsis
  makensis -V2 \
    "-DARG_WAILS_AMD64_BINARY=$(native "$exe")" \
    "-DINFO_PRODUCTVERSION=$numeric" \
    "-DOUTFILE=$(native "$target")" \
    project.nsi
)
ls -la "$out"
