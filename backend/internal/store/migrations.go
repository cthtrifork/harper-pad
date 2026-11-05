package store

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"path"
	"sort"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Migrations holds the SQL files applied in name order by harper-pad-sync (see Migrate).
//
//go:embed migrations/*.sql
var Migrations embed.FS

// migrateLockKey is the session-level advisory lock that serialises runners, so two pods starting together (a rolling update, a
// restart during a rollout) never apply the same file twice.
const migrateLockKey int64 = 0x68703a6d696772 // "hp:migr"

// Migrate applies the files of fsys (named like migrations/0001_init.sql) that are not yet recorded in schema_migrations, in
// name order, each in its own transaction together with its record, so a failed file leaves nothing behind and is tried again at
// the next start. It must run as the schema owner (harper_sync): the files create the tables and grant to the other roles. The
// roles themselves are not created here; the cluster does that (docs/sync.md, "Database access").
func Migrate(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS) ([]string, error) {
	names, err := fs.Glob(fsys, "migrations/*.sql")
	if err != nil {
		return nil, err
	}
	sort.Strings(names)

	conn, err := pool.Acquire(ctx)
	if err != nil {
		return nil, fmt.Errorf("migrations: %w", err)
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, `SELECT pg_advisory_lock($1)`, migrateLockKey); err != nil {
		return nil, fmt.Errorf("migrations: lock: %w", err)
	}
	// Unlock on a fresh context: ctx may be the reason we are leaving. If this fails the connection is closed by Release's
	// caller below, which drops the session lock.
	defer func() {
		uctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if _, err := conn.Exec(uctx, `SELECT pg_advisory_unlock($1)`, migrateLockKey); err != nil {
			_ = conn.Conn().Close(uctx)
		}
	}()

	if _, err := conn.Exec(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name       TEXT   PRIMARY KEY,
		applied_at BIGINT NOT NULL
	)`); err != nil {
		return nil, fmt.Errorf("migrations: %w", err)
	}
	rows, err := conn.Query(ctx, `SELECT name FROM schema_migrations`)
	if err != nil {
		return nil, fmt.Errorf("migrations: %w", err)
	}
	done := map[string]bool{}
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			rows.Close()
			return nil, err
		}
		done[n] = true
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}

	var applied []string
	for _, f := range names {
		name := strings.TrimSuffix(path.Base(f), ".sql")
		if done[name] {
			continue
		}
		sql, err := fs.ReadFile(fsys, f)
		if err != nil {
			return applied, err
		}
		tx, err := conn.Begin(ctx)
		if err != nil {
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		// No arguments: the simple protocol, so one file can hold several statements.
		if _, err := tx.Exec(ctx, string(sql)); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		if _, err := tx.Exec(ctx, `INSERT INTO schema_migrations (name, applied_at) VALUES ($1, $2)`, name, time.Now().UnixMilli()); err != nil {
			_ = tx.Rollback(ctx)
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		if err := tx.Commit(ctx); err != nil {
			return applied, fmt.Errorf("migration %s: %w", name, err)
		}
		applied = append(applied, name)
	}
	return applied, nil
}
