package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Open creates the connection pool. It does not connect, so a PostgreSQL that is down at start does not stop the process
// (readiness reports it, see Ping).
//
// With an empty databaseURL the driver reads the libpq environment (PGHOST, PGSSLCERT, ...), which is how the cluster supplies a
// client certificate. The certificates are read once; Stakater Reloader restarts the pods when they are renewed (docs/sync.md).
func Open(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("database configuration: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MaxConnLifetime = time.Hour
	cfg.MaxConnLifetimeJitter = 10 * time.Minute
	cfg.HealthCheckPeriod = time.Minute
	cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("database pool: %w", err)
	}
	return pool, nil
}
