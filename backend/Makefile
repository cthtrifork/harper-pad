SHELL := /bin/sh

# podman compose where podman exists, docker compose otherwise. Override with COMPOSE="docker compose".
COMPOSE ?= $(shell command -v podman >/dev/null 2>&1 && echo "podman compose" || echo "docker compose")
E2E_FILE := test/e2e/compose.yaml
export COMPOSE E2E_FILE

# CI sets PLAYWRIGHT_VERSION and the e2e target installs that playwright-core into .playwright/. Locally leave it unset and use
# PLAYWRIGHT_DIR, a global playwright-core or E2E_BROWSER_PATH (see README.md).
ifdef PLAYWRIGHT_VERSION
PLAYWRIGHT_DIR ?= $(CURDIR)/.playwright
export PLAYWRIGHT_DIR
endif

.DEFAULT_GOAL := help
.PHONY: help build test vet fmt openapi test-db admin-up wait-schema admin-seed admin-down e2e-certs e2e-web e2e-playwright e2e-up e2e-down e2e

help: ## List the targets
	@awk -F':.*## ' '/^[a-zA-Z_-]+:.*## /{printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

build: ## Build both commands into ./bin
	CGO_ENABLED=0 go build -trimpath -o bin/ ./cmd/...

test: ## Run the tests (the tests that use PostgreSQL are skipped without the stack, see test-db)
	go test -count=1 ./...

vet: ## go vet
	go vet ./...

fmt: ## Format the Go code
	gofmt -w .

openapi: ## Regenerate ../docs/openapi.yaml from the routes (the test fails when it is out of date)
	go test -count=1 ./internal/syncapi -run TestOpenAPIIsUpToDate -update

E2E_CERTS := $(CURDIR)/.e2e-certs
E2E_PG_PORT ?= 15432
export E2E_PG_PORT

E2E_CERT_FILES := ca.crt client.crt client.key admin.crt admin.key wrongcn.crt wrongcn.key

e2e-certs: ## Copy the running stack's throwaway certificates into .e2e-certs/ (the stack must be up)
	rm -rf $(E2E_CERTS) && mkdir -p $(E2E_CERTS)
	for f in $(E2E_CERT_FILES); do $(COMPOSE) -f $(E2E_FILE) exec -T postgres cat /certs/$$f > $(E2E_CERTS)/$$f || exit 1; done

# -p 1: the packages share one database (they truncate devices and invites), so they must not run at the same time.
test-db: ## Run all tests with PostgreSQL from the stack (TLS and client certificates); the stack is removed afterwards
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait postgres
	$(MAKE) e2e-certs
	TEST_PG_CERTS=$(E2E_CERTS) TEST_PG_PORT=$(E2E_PG_PORT) go test -p 1 -count=1 -race ./...; status=$$?; \
	$(COMPOSE) -f $(E2E_FILE) down -v; exit $$status

# The schema is applied by harper-pad-admin, as harper_admin (the table owner), when it starts; the sync service waits for it.
admin-up: ## Start PostgreSQL, the admin UI (it applies the schema; http://127.0.0.1:19001) and harper-pad-sync; add devices with admin-seed
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait postgres admin sync
	$(MAKE) wait-schema

wait-schema: ## Wait until harper-pad-admin has applied the migrations to the running stack
	@for i in $$(seq 1 30); do \
		$(COMPOSE) -f $(E2E_FILE) exec -T postgres psql -U harper_admin -d harper -tAc "SELECT count(*) FROM schema_migrations" 2>/dev/null | grep -q '^[1-9]' && exit 0; \
		sleep 1; \
	done; echo "the schema was not applied: see '$(COMPOSE) -f $(E2E_FILE) logs admin'"; exit 1

admin-seed: ## Add three devices to the running stack (testdata/admin-seed.sql)
	$(COMPOSE) -f $(E2E_FILE) exec -T postgres psql -U harper_admin -d harper -v ON_ERROR_STOP=1 < testdata/admin-seed.sql

admin-down: ## Stop the stack and delete its data
	$(COMPOSE) -f $(E2E_FILE) down -v

e2e-web: ## Build the web app for the end-to-end stack (served by Caddy at the root path)
	cd ../frontend && { [ -d node_modules ] || npm ci --ignore-scripts --no-audit --no-fund; } && BASE_PATH=/ npm run build:web
# TODO: the web build also needs the sync origin (https://sync.localhost:18443) in its CORS/CSP settings once the
# build-time setting exists (docs/sync.md, open questions).

e2e-up: ## Start PostgreSQL, the admin service (applies the schema), harper-pad-sync and Caddy
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait
	$(MAKE) wait-schema

e2e-down: ## Stop the end-to-end stack and delete its data
	$(COMPOSE) -f $(E2E_FILE) down -v

e2e-playwright: ## Install the pinned playwright-core into .playwright/ when PLAYWRIGHT_VERSION is set
	@if [ -n "$(PLAYWRIGHT_VERSION)" ]; then \
		npm install --no-save --no-audit --no-fund --prefix "$(PLAYWRIGHT_DIR)" "playwright-core@$(PLAYWRIGHT_VERSION)"; \
	fi

e2e: e2e-web e2e-playwright ## Run the end-to-end test; the stack is always removed afterwards, and its logs are printed on failure
	$(COMPOSE) -f $(E2E_FILE) up -d --build --wait && $(MAKE) wait-schema && node --test "test/e2e/*.test.mjs"; status=$$?; \
	if [ $$status -ne 0 ]; then $(COMPOSE) -f $(E2E_FILE) logs --no-color --tail 100; fi; \
	$(COMPOSE) -f $(E2E_FILE) down -v; exit $$status
