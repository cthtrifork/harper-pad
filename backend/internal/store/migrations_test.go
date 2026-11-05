package store

import (
	"context"
	"strings"
	"testing"
	"testing/fstest"
)

func TestMigrate(t *testing.T) {
	pgEnv(t, "harper_sync", "client")
	ctx := context.Background()
	pool, err := Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()

	// The real migrations: applied once, then nothing to do (also when the stack's database already has them).
	if _, err := Migrate(ctx, pool, Migrations); err != nil {
		t.Fatal(err)
	}
	if again, err := Migrate(ctx, pool, Migrations); err != nil || len(again) != 0 {
		t.Fatalf("second run applied %v, %v", again, err)
	}

	// Files apply in name order, a failing file leaves nothing behind (not even its earlier statements or its record) and is
	// not skipped, and an applied file is not run again.
	_, _ = pool.Exec(ctx, `DROP TABLE IF EXISTS mig_a, mig_b`)
	t.Cleanup(func() {
		_, _ = pool.Exec(ctx, `DROP TABLE IF EXISTS mig_a, mig_b; DELETE FROM schema_migrations WHERE name LIKE '9%'`)
	})
	fsys := fstest.MapFS{
		"migrations/9002_b.sql": {Data: []byte(`CREATE TABLE mig_b (id int); SELECT * FROM does_not_exist;`)},
		"migrations/9001_a.sql": {Data: []byte(`CREATE TABLE mig_a (id int); INSERT INTO mig_a VALUES (1);`)},
	}
	applied, err := Migrate(ctx, pool, fsys)
	if err == nil || !strings.Contains(err.Error(), "9002_b") {
		t.Fatalf("want the failure of 9002_b, got %v, %v", applied, err)
	}
	if len(applied) != 1 || applied[0] != "9001_a" {
		t.Errorf("applied = %v, want [9001_a]", applied)
	}
	var n int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM pg_tables WHERE tablename = 'mig_b'`).Scan(&n); err != nil || n != 0 {
		t.Errorf("mig_b exists after a failed file: %d, %v", n, err)
	}
	fsys["migrations/9002_b.sql"] = &fstest.MapFile{Data: []byte(`CREATE TABLE mig_b (id int);`)}
	applied, err = Migrate(ctx, pool, fsys)
	if err != nil || len(applied) != 1 || applied[0] != "9002_b" {
		t.Fatalf("retry applied %v, %v", applied, err)
	}
}
