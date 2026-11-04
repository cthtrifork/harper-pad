// Command harper-pad-admin is the admin UI of Harper Pad: Go and HTMX, reached through a Cloudflare Tunnel behind
// Cloudflare Access (docs/sync.md, "The admin UI").
//
// Scaffold: it serves /healthz (liveness) and /readyz (readiness, a PostgreSQL round trip) and nothing else yet, plus Prometheus
// metrics on a separate port. It is run as
// `harper-pad-admin serve` (a bare invocation does the same) and stops gracefully on SIGTERM. See internal/server.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/cthtrifork/harper-pad/backend/internal/config"
	"github.com/cthtrifork/harper-pad/backend/internal/metrics"
	"github.com/cthtrifork/harper-pad/backend/internal/server"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("harper-pad-admin", "err", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) > 1 || (len(args) == 1 && args[0] != "serve") {
		return fmt.Errorf("usage: harper-pad-admin [serve]")
	}
	cfg, err := config.LoadAdmin()
	if err != nil {
		return err
	}
	db, err := store.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	m := metrics.New("admin")
	m.RegisterPool(db)
	health := server.NewHealth(db)
	mux := http.NewServeMux()
	health.Register(mux)
	return server.Run(cfg.ListenAddr, m.Instrument(mux), health, cfg.MetricsAddr, m.Handler())
}
