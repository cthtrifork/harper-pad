// Command harper-pad-sync is the sync API of Harper Pad (docs/sync.md). It has no DDL rights, so /readyz is 503 until
// harper-pad-admin has applied the schema migrations. Metrics are on a separate port. See internal/server.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/config"
	"github.com/cthtrifork/harper-pad/backend/internal/metrics"
	"github.com/cthtrifork/harper-pad/backend/internal/server"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
	"github.com/cthtrifork/harper-pad/backend/internal/syncapi"
)

// version is the release, set at build time with -ldflags "-X main.version=..." (Containerfile.sync, from APP_VERSION).
var version = "dev"

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("harper-pad-sync", "err", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	if len(args) > 1 || (len(args) == 1 && args[0] != "serve") {
		return fmt.Errorf("usage: harper-pad-sync [serve]")
	}
	cfg, err := config.LoadSync()
	if err != nil {
		return err
	}
	db, err := store.Open(context.Background(), cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer db.Close()

	m := metrics.New("sync")
	m.RegisterPool(db)
	health := server.NewHealth(db)
	// The tables and the grants are made by harper-pad-admin, which owns them. This service has no DDL rights: /readyz is 503
	// ("starting") until the schema is current.
	health.SetStarting(true)
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	sync := store.NewSync(db)
	go waitForSchema(ctx, db, health)
	mux := http.NewServeMux()
	// The probes are on the metrics listener, off the public port; only without one do they use the public port.
	if cfg.MetricsAddr == "" {
		health.Register(mux)
	}
	verifier := auth.NewVerifier()
	defer verifier.Close()
	api := syncapi.New(cfg.PublicURL, cfg.AllowedOrigins, sync, verifier)
	api.Version = version
	api.Register(mux)
	if len(cfg.AllowedOrigins) == 0 {
		slog.Warn("CORS_ALLOWED_ORIGINS is empty: browsers on other origins cannot call the API")
	}
	return server.Run(cfg.ListenAddr, m.Instrument(api.CORS(syncapi.JSONNotFound(mux))), health, cfg.MetricsAddr, m.Handler())
}

// waitForSchema keeps /readyz at 503 until the schema is current. harper-pad-admin owns the tables and applies the migrations
// (backend/README.md); this service has no DDL rights and only waits for them, so it never serves a database that
// lacks its tables or its grants. It checks every 2 s, so it also copes with the database being down at start.
func waitForSchema(ctx context.Context, db *pgxpool.Pool, health *server.Health) {
	var lastErr string
	waiting := false
	for {
		ok, err := store.SchemaCurrent(ctx, db, store.Migrations)
		if ok {
			slog.Info("schema is current")
			health.SetStarting(false)
			return
		}
		if ctx.Err() != nil {
			return
		}
		switch {
		case err != nil && err.Error() != lastErr:
			lastErr = err.Error()
			slog.Warn("waiting for the schema: cannot check it", "err", err)
		case err == nil && !waiting:
			slog.Info("waiting for harper-pad-admin to apply the migrations")
		}
		waiting = true
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Second):
		}
	}
}
