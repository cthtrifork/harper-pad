#!/usr/bin/env bash
# Renders docs/screenshots/*.png from the headless server build (no GTK, no window).
# Needs Go, Node 20+ and Playwright. Playwright comes from PLAYWRIGHT_VERSION (pinned in
# .github/workflows/screenshots.yml; installed into a temp dir) or from a global install. Set
# SCREENSHOT_BROWSER_CHANNEL=chrome to drive an installed Google Chrome instead of Playwright's Chromium.
set -euo pipefail

cd "$(dirname "$0")/.."
out="${1:-docs/screenshots}"
port="${SCREENSHOT_PORT:-18080}"

# shellcheck source=lib/fake-app.sh
source scripts/lib/fake-app.sh

tmp="$(mktemp -d)"
trap 'fake_app_stop "$tmp"; rm -rf "$tmp"' EXIT

fake_app_build "$tmp"
fake_app_start "$tmp" "$port"

if [ -n "${PLAYWRIGHT_VERSION:-}" ]; then
  npm install --no-save --no-audit --no-fund --prefix "$tmp/pw" "playwright-core@${PLAYWRIGHT_VERSION}"
  export PLAYWRIGHT_DIR="$tmp/pw"
fi

mkdir -p "$out"
node scripts/screenshots.mjs "http://127.0.0.1:${port}/" "$out"
