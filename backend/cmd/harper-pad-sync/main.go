// Command harper-pad-sync is the sync API of Harper Pad (docs/sync.md).
//
// Scaffold: it serves /healthz (liveness) and /readyz (readiness, a PostgreSQL round trip) and nothing else yet. It is run as
// `harper-pad-sync serve` (a bare invocation does the same) and stops gracefully on SIGTERM. See internal/server.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"

	"github.com/cthtrifork/harper-pad/backend/internal/config"
	"github.com/cthtrifork/harper-pad/backend/internal/server"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
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

	health := server.NewHealth(db)
	mux := http.NewServeMux()
	health.Register(mux)
	return server.Run(cfg.ListenAddr, mux, health)
}
