#!/usr/bin/env bash
# Names omit "linux_amd64" so the in-app updater never matches them. Signed when PKG_SIGNING_KEY_FILE is set.
set -euo pipefail

bin="${1:?usage: package-linux.sh <binary> <version> <outdir>}"
version="${2:?usage: package-linux.sh <binary> <version> <outdir>}"
out="${3:?usage: package-linux.sh <binary> <version> <outdir>}"
app="${APP:-harper-pad}"

bin="$(realpath "$bin")"
out="$(realpath -m "$out")"
cd "$(dirname "$0")/.."

[ -x "$bin" ] || { echo "package-linux: $bin is not an executable file" >&2; exit 1; }
command -v wails3 >/dev/null || { echo "package-linux: wails3 not on PATH (make wails3-install)" >&2; exit 1; }
if [ -n "${PKG_SIGNING_KEY_FILE:-}" ]; then
  PKG_SIGNING_KEY_FILE="$(realpath "$PKG_SIGNING_KEY_FILE")"
  export PKG_SIGNING_KEY_FILE
else
  export PKG_SIGNING_KEY_FILE=""
fi

# nfpm wants a bare version: 1.2.3 or 1.2.3-rc.1 (packaged as 1.2.3~rc.1), no leading "v".
export PKG_VERSION="${version#v}"

stage="$(mktemp -d)"
# nfpm does not expand variables in contents paths, so the binary goes where nfpm.yaml expects it
# (bin/ is gitignored).
trap 'rm -rf "${stage:?}" bin/harper-pad' EXIT
mkdir -p "$out" bin
cp "$bin" bin/harper-pad

for format in deb rpm; do
  wails3 tool package -name "$app" -format "$format" -config ./build/linux/nfpm/nfpm.yaml -out "$stage"
done

# nfpm names them after its own convention (<name>_<ver>_amd64.deb, <name>-<ver>-1.x86_64.rpm).
# Rename to one scheme so the workflow does not have to guess.
deb=("$stage"/*.deb); rpm=("$stage"/*.rpm)
[ "${#deb[@]}" -eq 1 ] && [ "${#rpm[@]}" -eq 1 ] || { echo "package-linux: expected one .deb and one .rpm in $stage" >&2; ls "$stage" >&2; exit 1; }
cp "${deb[0]}" "$out/${app}_${version}_amd64.deb"
cp "${rpm[0]}" "$out/${app}_${version}_x86_64.rpm"
ls -l "$out"
