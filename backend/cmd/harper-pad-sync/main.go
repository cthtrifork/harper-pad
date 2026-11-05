// Command harper-pad-sync is the sync API of Harper Pad (docs/sync.md).
//
// It serves /healthz (liveness), /readyz (readiness, a PostgreSQL round trip), POST /enroll and Prometheus metrics on a separate
// port; the draft routes are not built yet. It is run as
// `harper-pad-sync serve` (a bare invocation does the same) and stops gracefully on SIGTERM. See internal/server.
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
	// The tables and the grants to harper_admin are made by the migrations, run here as harper_sync. PostgreSQL does not have
	// to be up at start, so retry in the background; /readyz is 503 ("starting") until they are applied.
	health.SetStarting(true)
	ctx, stop := context.WithCancel(context.Background())
	defer stop()
	sync := store.NewSync(db)
	go migrate(ctx, db, sync, health)
	mux := http.NewServeMux()
	health.Register(mux)
	api := syncapi.New(cfg.PublicURL, cfg.AllowedOrigins, sync, auth.NewVerifier())
	api.Register(mux)
	if len(cfg.AllowedOrigins) == 0 {
		slog.Warn("CORS_ALLOWED_ORIGINS is empty: browsers on other origins cannot call the API")
	}
	return server.Run(cfg.ListenAddr, m.Instrument(api.CORS(mux)), health, cfg.MetricsAddr, m.Handler())
}

// purgeInvites deletes long-expired invites once an hour until ctx ends (docs/sync.md: "a periodic delete removes expired invites").
func purgeInvites(ctx context.Context, sync *store.Sync) {
	t := time.NewTicker(time.Hour)
	defer t.Stop()
	for {
		if n, err := sync.PurgeInvites(ctx); err != nil && ctx.Err() == nil {
			slog.Error("purging expired invites", "err", err)
		} else if n > 0 {
			slog.Info("purged expired invites", "count", n)
		}
		select {
		case <-ctx.Done():
			return
		case <-t.C:
		}
	}
}

// migrate applies the schema, retrying with a growing delay (2 s up to 30 s) while the database is unreachable or a migration
// fails, and then lets /readyz pass. A failing file is logged each time and never skipped.
func migrate(ctx context.Context, db *pgxpool.Pool, sync *store.Sync, health *server.Health) {
	delay := 2 * time.Second
	for {
		applied, err := store.Migrate(ctx, db, store.Migrations)
		if err == nil {
			slog.Info("migrations applied", "files", applied)
			health.SetStarting(false)
			purgeInvites(ctx, sync)
			return
		}
		if ctx.Err() != nil {
			return
		}
		slog.Error("migrations failed, retrying", "err", err, "in", delay)
		select {
		case <-ctx.Done():
			return
		case <-time.After(delay):
		}
		delay = min(delay*2, 30*time.Second)
	}
}
