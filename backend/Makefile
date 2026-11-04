SHELL := /bin/sh

# podman compose where podman exists, docker compose otherwise. Override with COMPOSE="docker compose".
COMPOSE ?= $(shell command -v podman >/dev/null 2>&1 && echo "podman compose" || echo "docker compose")
E2E_FILE := test/e2e/compose.yaml

# CI sets PLAYWRIGHT_VERSION and the e2e target installs that playwright-core into .playwright/. Locally leave it unset and use
# PLAYWRIGHT_DIR, a global playwright-core or E2E_BROWSER_PATH (see README.md).
ifdef PLAYWRIGHT_VERSION
PLAYWRIGHT_DIR ?= $(CURDIR)/.playwright
export PLAYWRIGHT_DIR
endif

.DEFAULT_GOAL := help
.PHONY: help build test vet fmt e2e-web e2e-playwright e2e-up e2e-down e2e

help: ## List the targets
	@awk -F':.*## ' '/^[a-zA-Z_-]+:.*## /{printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build both commands into ./bin
	CGO_ENABLED=0 go build -trimpath -o bin/ ./cmd/...

test: ## Run the unit tests (the store tests will need a PostgreSQL)
	go test -count=1 ./...

vet: ## go vet
	go vet ./...

fmt: ## Format the Go code
	gofmt -w .

e2e-web: ## Build the web app for the end-to-end stack (served by Caddy at the root path)
	cd ../frontend && { [ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; } && BASE_PATH=/ npm run build:web
# TODO: the web build also needs the sync origin (https://sync.localhost:18443) in its CORS/CSP settings once the
# build-time setting exists (docs/sync.md, open questions).

e2e-up: ## Start PostgreSQL, harper-pad-sync and Caddy
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait

e2e-down: ## Stop the end-to-end stack and delete its data
	$(COMPOSE) -f $(E2E_FILE) down -v

e2e-playwright: ## Install the pinned playwright-core into .playwright/ when PLAYWRIGHT_VERSION is set
	@if [ -n "$(PLAYWRIGHT_VERSION)" ]; then \
		npm install --no-save --no-audit --no-fund --prefix "$(PLAYWRIGHT_DIR)" "playwright-core@$(PLAYWRIGHT_VERSION)"; \
	fi

e2e: e2e-web e2e-playwright ## Run the end-to-end test; the stack is always removed afterwards, and its logs are printed on failure
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait && node --test "test/e2e/*.test.mjs"; status=$$?; \
	if [ $$status -ne 0 ]; then $(COMPOSE) -f $(E2E_FILE) logs --no-color --tail 100; fi; \
	$(COMPOSE) -f $(E2E_FILE) down -v; exit $$status
