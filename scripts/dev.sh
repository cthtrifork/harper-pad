#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export WAILS_SERVER_PORT="${WAILS_SERVER_PORT:-8080}"
vite_port="${WAILS_VITE_PORT:-9245}"
export WAILS_VITE_PORT="$vite_port"
gopath="$(go env GOPATH)"
export PATH="$PATH:$gopath/bin"

command -v wails3 >/dev/null || { echo "wails3 not found: make wails3-install" >&2; exit 1; }

(cd frontend && [ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund)

echo "dev: http://localhost:$WAILS_SERVER_PORT (Vue: HMR, Go: rebuild on save)"
exec wails3 dev -config ./build/config.yml -port "$vite_port"
