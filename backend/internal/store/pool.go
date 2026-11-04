package store

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Open creates the connection pool. It does not connect: pgxpool dials lazily, so a PostgreSQL that is down at start does not
// stop the process (readiness reports it, see Ping) and the service recovers by itself when the database comes back.
//
// With an empty databaseURL the driver reads the standard libpq environment (PGHOST, PGPORT, PGDATABASE, PGUSER, PGSSLMODE,
// PGSSLROOTCERT, PGSSLCERT, PGSSLKEY), which is how the cluster supplies a client certificate and no password. The driver reads
// the certificate files once, at start: when cert-manager renews them, Stakater Reloader restarts the pods (docs/sync.md,
// "Database access"), so the service does not reload them itself.
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
