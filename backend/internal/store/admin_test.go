package store

import (
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/admin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var t0 = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

// adminFixture makes a throwaway database from migrations/, as a superuser (TEST_DATABASE_URL, any database on a scratch
// PostgreSQL), and returns the admin store, whose connections `SET ROLE harper_admin`, so the real grants are what the test runs under,
// plus the superuser connection to seed rows. The tests are skipped when TEST_DATABASE_URL is not set.
func adminFixture(t *testing.T) (*Admin, *pgxpool.Pool, *pgx.Conn) {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL is not set (a superuser URL for a scratch PostgreSQL)")
	}
	ctx := context.Background()
	root, err := pgx.Connect(ctx, url)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = root.Close(ctx) })

	name := fmt.Sprintf("hp_admin_test_%d", time.Now().UnixNano())
	for _, q := range []string{
		`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'harper_admin') THEN CREATE ROLE harper_admin NOLOGIN; END IF; END $$`,
		`CREATE DATABASE ` + name,
	} {
		if _, err := root.Exec(ctx, q); err != nil {
			t.Fatal(err)
		}
	}
	t.Cleanup(func() {
		c, err := pgx.Connect(ctx, url)
		if err == nil {
			_, _ = c.Exec(ctx, `DROP DATABASE `+name+` WITH (FORCE)`)
			_ = c.Close(ctx)
		}
	})

	cfg, err := pgx.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	cfg.Database = name
	owner, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = owner.Close(ctx) })
	files, err := Migrations.ReadDir("migrations")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range files {
		sql, err := Migrations.ReadFile("migrations/" + f.Name())
		if err != nil {
			t.Fatal(err)
		}
		if _, err := owner.Exec(ctx, string(sql)); err != nil {
			t.Fatalf("%s: %v", f.Name(), err)
		}
	}

	pcfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		t.Fatal(err)
	}
	pcfg.ConnConfig.Database = name
	// Every connection of the store's pool drops to harper_admin, so queries run under that role's grants without the test
	// needing a password for it (which would clash with a role someone made by hand on the same server).
	pcfg.AfterConnect = func(ctx context.Context, c *pgx.Conn) error {
		_, err := c.Exec(ctx, `SET ROLE harper_admin`)
		return err
	}
	pool, err := pgxpool.NewWithConfig(ctx, pcfg)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	a := NewAdmin(pool)
	a.now = func() time.Time { return t0 }
	return a, pool, owner
}

func seedDevice(t *testing.T, owner *pgx.Conn, id, name string, created, seen time.Time) {
	t.Helper()
	_, err := owner.Exec(context.Background(),
		`INSERT INTO devices (id, client_id, name, user_agent, token_hash, public_key, created_at, last_seen)
		 VALUES ($1::text, 1, $2, 'Safari', sha256(convert_to($1::text, 'UTF8')), '{}', $3, $4)`,
		id, name, created.UnixMilli(), seen.UnixMilli())
	if err != nil {
		t.Fatal(err)
	}
}

func TestAdminDevices(t *testing.T) {
	a, _, owner := adminFixture(t)
	ctx := context.Background()
	seedDevice(t, owner, "d2", "iPhone", t0.Add(-48*time.Hour), time.UnixMilli(0))
	seedDevice(t, owner, "d1", "Desktop", t0.Add(-72*time.Hour), t0.Add(-time.Minute))

	devs, err := a.Devices(ctx)
	if err != nil || len(devs) != 2 {
		t.Fatalf("Devices = %v, %v", devs, err)
	}
	if devs[0].ID != "d1" || devs[1].ID != "d2" {
		t.Errorf("not ordered by creation: %v", devs)
	}
	if !devs[0].LastSeen.Equal(t0.Add(-time.Minute)) || !devs[1].LastSeen.IsZero() {
		t.Errorf("last seen: %v / %v", devs[0].LastSeen, devs[1].LastSeen)
	}

	d, err := a.RenameDevice(ctx, "d2", "iPhone 15")
	if err != nil || d.Name != "iPhone 15" || d.UserAgent != "Safari" {
		t.Errorf("rename: %+v, %v", d, err)
	}
	if _, err := a.RenameDevice(ctx, "nope", "x"); !errors.Is(err, admin.ErrNotFound) {
		t.Errorf("rename unknown: %v", err)
	}

	if err := a.RevokeDevice(ctx, "d1"); err != nil {
		t.Fatal(err)
	}
	if err := a.RevokeDevice(ctx, "d1"); !errors.Is(err, admin.ErrNotFound) {
		t.Errorf("revoke twice: %v", err)
	}
	if devs, _ := a.Devices(ctx); len(devs) != 1 || devs[0].ID != "d2" {
		t.Errorf("after revoke: %v", devs)
	}
}

func TestAdminInvites(t *testing.T) {
	a, pool, owner := adminFixture(t)
	ctx := context.Background()

	accts, err := a.Accounts(ctx)
	if err != nil || len(accts) != 1 || accts[0].Name != "default" {
		t.Fatalf("Accounts = %v, %v", accts, err)
	}

	token, inv, err := a.CreateInvite(ctx, "iPhone 2", 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	if len(token) != 43 || inv.DeviceName != "iPhone 2" || !inv.ExpiresAt.Equal(t0.Add(15*time.Minute)) {
		t.Errorf("token %q, invite %+v", token, inv)
	}

	// Only the SHA-256 of the token is stored, and the page's handle is neither the token nor that hash.
	var stored []byte
	if err := pool.QueryRow(ctx, `SELECT token_hash FROM invites`).Scan(&stored); err != nil {
		t.Fatal(err)
	}
	want := sha256.Sum256([]byte(token))
	if string(stored) != string(want[:]) || strings.Contains(inv.ID, token) {
		t.Error("stored hash is not SHA-256 of the token")
	}

	// Pending: not expired, not spent.
	other, _, _ := a.CreateInvite(ctx, "Laptop", time.Minute)
	if _, err := owner.Exec(ctx, `UPDATE invites SET used_at = $1 WHERE token_hash = sha256(convert_to($2::text, 'UTF8'))`, t0.UnixMilli(), other); err != nil {
		t.Fatal(err)
	}
	if _, _, err := a.CreateInvite(ctx, "Short", time.Minute); err != nil {
		t.Fatal(err)
	}
	got, err := a.PendingInvites(ctx, t0.Add(2*time.Minute))
	if err != nil || len(got) != 1 || got[0].ID != inv.ID {
		t.Errorf("pending at +2min = %v, %v (the spent and the expired one must be hidden)", got, err)
	}

	if err := a.CancelInvite(ctx, inv.ID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{inv.ID, "zz", strings.Repeat("0", 64)} {
		if err := a.CancelInvite(ctx, id); !errors.Is(err, admin.ErrNotFound) {
			t.Errorf("cancel %q: %v", id, err)
		}
	}
}

func TestAdminRefusesInviteWithSeveralAccounts(t *testing.T) {
	a, pool, owner := adminFixture(t)
	if _, err := owner.Exec(context.Background(), `INSERT INTO clients (name, created_at) VALUES ('family', 0)`); err != nil {
		t.Fatal(err)
	}
	if _, _, err := a.CreateInvite(context.Background(), "x", time.Minute); !errors.Is(err, admin.ErrInvalid) {
		t.Errorf("CreateInvite = %v, want ErrInvalid", err)
	}
	var n int
	_ = pool.QueryRow(context.Background(), `SELECT count(*) FROM invites`).Scan(&n)
	if n != 0 {
		t.Errorf("%d invites were created", n)
	}
}

// The admin role must not be able to read notes or change devices beyond renaming: the database enforces it, not the Go code.
func TestAdminRoleGrants(t *testing.T) {
	_, pool, _ := adminFixture(t)
	ctx := context.Background()
	for _, q := range []string{
		`SELECT * FROM docs`,
		`SELECT * FROM meta`,
		`INSERT INTO devices (id, client_id, name, token_hash, public_key, created_at, last_seen) VALUES ('x', 1, 'x', 'x', '{}', 0, 0)`,
		`UPDATE devices SET token_hash = 'x'`,
		`UPDATE clients SET name = 'x'`,
		`CREATE TABLE evil (a int)`,
	} {
		_, err := pool.Exec(ctx, q)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "42501" { // insufficient_privilege, not some other failure
			t.Errorf("%s: err = %v, want a permission error", q, err)
		}
	}
}
