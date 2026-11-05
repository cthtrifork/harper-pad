package store

import (
	"context"
	"crypto/sha256"
	"errors"
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

// pgEnv points the libpq variables at the end-to-end stack's PostgreSQL (backend/test/e2e: TLS 1.3, client-certificate login, no
// passwords), which is how the cluster configures the services; store.Open("") reads them. The certificates are copied out of the
// stack's volume by `make test-db`. The tests are skipped when TEST_PG_CERTS is not set.
func pgEnv(t *testing.T, role, cert string) {
	t.Helper()
	dir := os.Getenv("TEST_PG_CERTS")
	if dir == "" {
		t.Skip("TEST_PG_CERTS is not set: run `make test-db` in backend/ (PostgreSQL with TLS client certificates from the e2e stack)")
	}
	port := os.Getenv("TEST_PG_PORT")
	if port == "" {
		port = "15432"
	}
	for k, v := range map[string]string{
		"PGHOST": "localhost", "PGPORT": port, "PGDATABASE": "harper", "PGUSER": role, "PGSSLMODE": "verify-full",
		"PGSSLROOTCERT": dir + "/ca.crt", "PGSSLCERT": dir + "/" + cert + ".crt", "PGSSLKEY": dir + "/" + cert + ".key",
		"PGPASSWORD": "", "DATABASE_URL": "",
	} {
		t.Setenv(k, v)
	}
}

// adminFixture returns the admin store, connected as harper_admin with its client certificate (so the real grants apply), the
// pool behind it, and a connection as harper_sync (the schema owner and, in this stack, a superuser) to seed rows. Each test
// starts from an empty devices and invites table and the single default account; the schema comes from migrations/ (the stack
// applies it at first start).
func adminFixture(t *testing.T) (*Admin, *pgxpool.Pool, *pgx.Conn) {
	t.Helper()
	ctx := context.Background()

	pgEnv(t, "harper_sync", "client")
	cfg, err := pgx.ParseConfig("")
	if err != nil {
		t.Fatal(err)
	}
	owner, err := pgx.ConnectConfig(ctx, cfg)
	if err != nil {
		t.Fatalf("connecting as harper_sync (is the stack up? make test-db): %v", err)
	}
	t.Cleanup(func() { _ = owner.Close(ctx) })
	// The schema is made the way harper-pad-sync makes it at start, as the owner (the stack only creates the roles).
	ownerPool, err := Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(ownerPool.Close)
	if _, err := Migrate(ctx, ownerPool, Migrations); err != nil {
		t.Fatalf("migrations as harper_sync: %v", err)
	}
	reset := func() {
		if _, err := owner.Exec(ctx, `TRUNCATE devices, invites; DELETE FROM clients WHERE id <> 1`); err != nil {
			t.Fatal(err)
		}
	}
	reset()
	t.Cleanup(reset)

	pgEnv(t, "harper_admin", "admin")
	pool, err := Open(ctx, "")
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
		`INSERT INTO devices (id, client_id, name, user_agent, token_hash, key_thumbprint, created_at, last_seen)
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

// The login itself: PostgreSQL accepts the role only with a client certificate whose common name is the role.
func TestAdminLoginNeedsItsOwnCertificate(t *testing.T) {
	pgEnv(t, "harper_admin", "wrongcn") // a certificate from the same CA with another common name
	pool, err := Open(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err == nil {
		t.Error("harper_admin logged in with another role's certificate")
	}

	t.Setenv("PGSSLMODE", "disable") // and plain TCP is refused too
	t.Setenv("PGSSLCERT", os.Getenv("TEST_PG_CERTS")+"/admin.crt")
	t.Setenv("PGSSLKEY", os.Getenv("TEST_PG_CERTS")+"/admin.key")
	plain, err := Open(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer plain.Close()
	if err := plain.Ping(context.Background()); err == nil {
		t.Error("harper_admin logged in without TLS")
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
		`INSERT INTO devices (id, client_id, name, token_hash, key_thumbprint, created_at, last_seen) VALUES ('x', 1, 'x', 'x', '{}', 0, 0)`,
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
