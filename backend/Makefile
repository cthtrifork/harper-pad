SHELL := /bin/sh

# podman compose where podman exists, docker compose otherwise. Override with COMPOSE="docker compose".
COMPOSE ?= $(shell command -v podman >/dev/null 2>&1 && echo "podman compose" || echo "docker compose")
# The container engine behind it, for the one place that needs it directly (copying the certificates out of the volume).
ENGINE ?= $(firstword $(COMPOSE))
E2E_FILE := test/e2e/compose.yaml
export COMPOSE E2E_FILE

# CI sets PLAYWRIGHT_VERSION and the e2e target installs that playwright-core into .playwright/. Locally leave it unset and use
# PLAYWRIGHT_DIR, a global playwright-core or E2E_BROWSER_PATH (see README.md).
ifdef PLAYWRIGHT_VERSION
PLAYWRIGHT_DIR ?= $(CURDIR)/.playwright
export PLAYWRIGHT_DIR
endif

.DEFAULT_GOAL := help
.PHONY: help build test vet fmt test-db admin-up admin-seed admin-down e2e-certs e2e-web e2e-playwright e2e-up e2e-down e2e

help: ## List the targets
	@awk -F':.*## ' '/^[a-zA-Z_-]+:.*## /{printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build both commands into ./bin
	CGO_ENABLED=0 go build -trimpath -o bin/ ./cmd/...

test: ## Run the tests (the store tests are skipped without the PostgreSQL stack, see test-db)
	go test -count=1 ./...

vet: ## go vet
	go vet ./...

fmt: ## Format the Go code
	gofmt -w .

E2E_CERTS := $(CURDIR)/.e2e-certs
E2E_PG_PORT ?= 15432
export E2E_PG_PORT

e2e-certs: ## Copy the stack's throwaway certificates out of its volume into .e2e-certs/
	rm -rf $(E2E_CERTS) && mkdir -p $(E2E_CERTS)
	$(ENGINE) run --rm --user 0:0 -v harper-pad-e2e_pgcerts:/certs:ro -v $(E2E_CERTS):/out:z --entrypoint /bin/sh \
		mirror.gcr.io/library/postgres:17 -c 'cp /certs/ca.crt /certs/client.crt /certs/client.key /certs/admin.crt /certs/admin.key /certs/wrongcn.crt /certs/wrongcn.key /out/ && chmod 644 /out/*'

test-db: ## Run all tests with PostgreSQL from the stack (TLS and client certificates); the stack is removed afterwards
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait postgres
	$(MAKE) e2e-certs
	TEST_PG_CERTS=$(E2E_CERTS) TEST_PG_PORT=$(E2E_PG_PORT) go test -count=1 -race ./...; status=$$?; \
	$(COMPOSE) -f $(E2E_FILE) down -v; exit $$status

admin-up: ## Start PostgreSQL and the admin UI (http://127.0.0.1:19001); add devices with admin-seed
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait postgres admin

admin-seed: ## Add three devices to the running stack (testdata/admin-seed.sql)
	$(COMPOSE) -f $(E2E_FILE) exec -T postgres psql -U harper_sync -d harper -v ON_ERROR_STOP=1 < testdata/admin-seed.sql

admin-down: ## Stop the stack and delete its data
	$(COMPOSE) -f $(E2E_FILE) down -v

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
