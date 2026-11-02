SHELL := /bin/sh

VERSION   ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
# Build tags for the production vet; a GTK-free environment sets this to server,production.
VET_TAGS  ?= production
# -race needs cgo, which pulls in GTK; a GTK-free environment sets RACE to empty.
RACE      ?= -race
# OUT: where `make build` and `make build-server` write the binary.
OUT       ?= harper-pad
MODULE    := github.com/cthtrifork/harper-pad

.DEFAULT_GOAL := help
.PHONY: help test check fmt format lint lint-go lint-frontend tools format-frontend vet frontend bindings wails3-install dev dev-frontend build build-server run run-mcp run-mcp-server run-pprof-server

help: ## List the targets
	@awk -F':.*## ' '/^[a-zA-Z_-]+:.*## /{printf "  %-17s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

## Development -------------------------------------------------------------

test: ## Run the Go tests as CI does
	go test $(RACE) -count=1 ./...

fmt: ## Format the Go code
	gofmt -w .

format: fmt format-frontend ## Format the Go code and the Vue app

# Dev tool versions. Renovate keeps them current through the `# renovate:` comments (renovate.json5).
# renovate: datasource=github-releases depName=golangci/golangci-lint
GOLANGCI_LINT_VERSION := v2.15.0
# renovate: datasource=go depName=golang.org/x/tools
GOIMPORTS_VERSION := v0.52.0

lint: lint-go lint-frontend ## golangci-lint plus the frontend's Biome lint and format check (as CI runs them)

lint-go: ## golangci-lint on the server-tag build (CGO off, no GTK needed)
	CGO_ENABLED=0 go run github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION) run --config .github/linters/golangci.yml --build-tags server ./...

tools: ## Install goimports and golangci-lint into GOBIN (for editors)
	go install golang.org/x/tools/cmd/goimports@$(GOIMPORTS_VERSION)
	go install github.com/golangci/golangci-lint/v2/cmd/golangci-lint@$(GOLANGCI_LINT_VERSION)

lint-frontend: ## Biome lint and format check for the Vue app (needs `make frontend` once for node_modules)
	cd frontend && npm run lint && npm run format:check

format-frontend: ## Reformat the Vue app with Biome
	cd frontend && npm run format

vet: ## go vet, with and without the production tag
	go vet ./...
	go vet -tags $(VET_TAGS) ./...

check: ## Everything CI checks that runs without GTK: gofmt, tidy, vet, tests, headless build
	@unformatted="$$(gofmt -l .)"; if [ -n "$$unformatted" ]; then echo "These files need gofmt:"; echo "$$unformatted"; exit 1; fi
	go mod tidy -diff
	$(MAKE) vet test build-server

frontend: ## Build the Vue app into frontend/dist (embedded by the Go binary)
	cd frontend && npm ci --ignore-scripts --no-audit --no-fund && npm run build

wails3-install: ## Install the wails3 CLI at the go.mod version into GOBIN (default: $$(go env GOPATH)/bin)
	CGO_ENABLED=0 go install -tags server github.com/wailsapp/wails/v3/cmd/wails3@$$(go list -m -f '{{.Version}}' github.com/wailsapp/wails/v3)

bindings: ## Regenerate frontend/bindings from the Go services (needs the wails3 CLI)
	CGO_ENABLED=0 wails3 generate bindings -silent

dev: ## Hot reload via `wails3 dev` in server mode: Vite HMR + rebuild-on-save Go (http://localhost:8080)
	scripts/dev.sh

dev-frontend: ## Vite dev server with hot reload; then run: FRONTEND_DEVSERVER_URL=http://127.0.0.1:9245 go run .
	cd frontend && npm run dev

build: frontend ## Desktop release build (needs GTK4 + WebKitGTK 6)
	go build -tags production -trimpath -buildvcs=false -ldflags "-w -s -X $(MODULE)/internal/app.version=$(VERSION)" -o $(OUT) .

build-server: frontend ## Headless server build, no GTK needed
	CGO_ENABLED=0 go build -tags server,production -trimpath -buildvcs=false -ldflags "-w -s -X $(MODULE)/internal/app.version=$(VERSION)" -o $(OUT) .

run: frontend ## Run the desktop app
	go run .

run-mcp: frontend ## Desktop app with Wails' MCP server on 127.0.0.1:9099 (dev only; see docs/mcp.md)
	go run -tags mcp .

run-mcp-server: frontend ## Headless app with the MCP server; only app_info, windows_list, emit_event work (no webview)
	CGO_ENABLED=0 go run -tags server,mcp .

run-pprof-server: frontend ## Headless app with a pprof endpoint on 127.0.0.1:6060 (dev only; see docs/pprof.md)
	CGO_ENABLED=0 go run -tags server,pprof .
