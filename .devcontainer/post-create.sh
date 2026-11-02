#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

# A clone owned by another uid (rootful Docker, Codespaces) would make git refuse to run.
git config --global --add safe.directory "$PWD"


(cd frontend && npm ci --ignore-scripts --no-audit --no-fund)
go mod download
make wails3-install
# Tools the Go extension runs from the devcontainer settings (format on save, lint on save).
# Versions are pinned in the Makefile.
make tools
