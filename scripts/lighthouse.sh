#!/usr/bin/env bash
# Audits the UI with Lighthouse (mobile and desktop); fails below the thresholds in lighthouse.mjs.
# Serves the headless build via scripts/lib/fake-app.sh. Needs Go, Node 20+ and Chrome (CHROME_PATH); set
# LIGHTHOUSE_VERSION (pinned in .github/workflows/lighthouse.yml) to run it by hand.
set -euo pipefail

cd "$(dirname "$0")/.."
out="${1:-lighthouse}"
port="${LIGHTHOUSE_PORT:-18081}"

# shellcheck source=lib/fake-app.sh
source scripts/lib/fake-app.sh

tmp="$(mktemp -d)"
trap 'fake_app_stop "$tmp"; rm -rf "$tmp"' EXIT

fake_app_build "$tmp"
fake_app_start "$tmp" "$port"

mkdir -p "$out"
LIGHTHOUSE_URL="http://127.0.0.1:${port}/" node scripts/lighthouse.mjs "$out"
