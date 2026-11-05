#!/usr/bin/env bash
# Vendor htmx.org <version> into the admin UI: the minified build and its licence, from the npm tarball.
# The tarball is checked against the integrity hash the npm registry publishes for that version.
# Usage: scripts/update-htmx.sh <version>   (make htmx; Renovate runs it as a post-upgrade task)
set -euo pipefail

version="${1:?usage: $0 <version>}"
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "not a plain version: $version" >&2; exit 1; }

dest="$(cd "$(dirname "$0")/.." && pwd)/backend/internal/admin/web/static"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "https://registry.npmjs.org/htmx.org/-/htmx.org-$version.tgz" -o "$tmp/htmx.tgz"
want="$(curl -fsSL "https://registry.npmjs.org/htmx.org/$version" | grep -o '"integrity":"sha512-[^"]*"' | head -n1 | sed 's/.*"sha512-\(.*\)"/\1/')"
got="$(openssl dgst -sha512 -binary "$tmp/htmx.tgz" | base64 -w0)"
[ -n "$want" ] && [ "$want" = "$got" ] || { echo "integrity mismatch for htmx.org $version" >&2; exit 1; }

tar -xzf "$tmp/htmx.tgz" -C "$tmp" package/dist/htmx.min.js package/LICENSE
install -m 644 "$tmp/package/dist/htmx.min.js" "$dest/htmx.min.js"
install -m 644 "$tmp/package/LICENSE" "$dest/htmx.LICENSE.txt"
echo "htmx $version vendored into $dest"
