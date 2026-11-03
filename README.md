# Harper Pad

A small desktop writing app: a grammar-checked editor ([Harper](https://writewithharper.com), running on-device
as WebAssembly) and a scratch pad drawer. Go + [Wails v3](https://v3alpha.wails.io/) with a Vue 3 frontend.

Status: **spike**. The window lints a textarea with `harper.js` in a Web Worker to prove the stack works in
WebKitGTK (it does). The editor and the drawer are not built yet.

The project scaffolding (CI, linters, Renovate, release drafting, dev tooling) is borrowed from
[trivy-dashboard-wail3](https://github.com/cthtrifork/trivy-dashboard-wail3).

## Develop

```sh
make help      # list targets
make frontend  # build the Vue app into frontend/dist (needed before any go build/run)
make check     # gofmt, go mod tidy, vet, tests and a headless build; no GTK needed
make lint      # golangci-lint plus Biome
make run       # desktop window (needs GTK4 + WebKitGTK 6)
```

Without GTK (CI, sandboxes) use server mode: `CGO_ENABLED=0 go run -tags server .` serves the UI on
`http://localhost:8080` (`WAILS_SERVER_PORT` changes the port).
