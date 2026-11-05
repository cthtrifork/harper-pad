// Command harper-pad-admin is the admin UI of Harper Pad: Go and HTMX, reached through a Cloudflare Tunnel behind
// Cloudflare Access (docs/sync.md, "The admin UI").
//
// It applies the schema migrations at start (it is the table owner), serves /healthz (liveness) and /readyz (readiness, a PostgreSQL
// round trip, 503 until the migrations are applied), the admin pages (internal/admin) and Prometheus
// metrics on a separate port. It is run as
// `harper-pad-admin serve` (a bare invocation does the same) and stops gracefully on SIGTERM. See internal/server.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/cthtrifork/harper-pad/backend/internal/admin"
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
	// This service owns the tables (harper_admin) and applies the migrations; harper-pad-sync, which has no DDL rights, waits for them.
	// PostgreSQL does not have to be up at start, so retry in the background; /readyz is 503 ("starting") until they are applied.
	health.SetStarting(true)
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	go func() {
		if store.MigrateWithRetry(ctx, db, store.Migrations) {
			health.SetStarting(false)
		}
	}()
	mux := http.NewServeMux()
	health.Register(mux)

	mux.Handle("/", admin.New(store.NewAdmin(db), admin.Config{SyncURL: cfg.SyncPublicURL}))
	return server.Run(cfg.ListenAddr, m.Instrument(mux), health, cfg.MetricsAddr, m.Handler())
}
