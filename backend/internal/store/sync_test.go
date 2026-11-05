package store

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"sync"
	"sync/atomic"
	"testing"
	"testing/fstest"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// syncFixture returns the sync store connected as harper_sync (its client certificate, so its real, row-level grants apply) and the
// pool of the table owner, harper_admin, which applies the migrations (as harper-pad-admin does at start), seeds rows and checks
// them. The devices and invites tables are empty at the start of each test.
func syncFixture(t *testing.T) (*Sync, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()

	pgEnv(t, "harper_admin", "admin")
	owner, err := Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(owner.Close)
	if _, err := Migrate(ctx, owner, Migrations); err != nil {
		t.Fatal(err)
	}
	reset := func() {
		if _, err := owner.Exec(ctx, `TRUNCATE devices, invites`); err != nil {
			t.Fatal(err)
		}
	}
	reset()
	t.Cleanup(reset)

	pgEnv(t, "harper_sync", "client")
	pool, err := Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	s := NewSync(pool)
	s.now = func() time.Time { return t0 }
	return s, owner
}

func seedInvite(t *testing.T, pool *pgxpool.Pool, token, name string, expires time.Time) []byte {
	t.Helper()
	h := auth.HashToken(token)
	if _, err := pool.Exec(context.Background(),
		`INSERT INTO invites (token_hash, client_id, device_name, created_at, expires_at) VALUES ($1, 1, $2, $3, $4)`,
		h, name, t0.UnixMilli(), expires.UnixMilli()); err != nil {
		t.Fatal(err)
	}
	return h
}

func enroll(s *Sync, invite []byte, id, name, key string, token string) error {
	return s.Enroll(context.Background(), invite, id, name, "Safari", key, auth.HashToken(token))
}

func TestEnroll(t *testing.T) {
	s, pool := syncFixture(t)
	ctx := context.Background()
	inv := seedInvite(t, pool, "invite-1", "Kitchen iPad", t0.Add(15*time.Minute))

	if err := enroll(s, inv, "dev1", "from the request", `{"kty":"EC"}`, "tok-1"); err != nil {
		t.Fatal(err)
	}
	var name, ua, key string
	var client, created, seen int64
	var used *int64
	err := pool.QueryRow(ctx, `SELECT name, user_agent, key_thumbprint, client_id, created_at, last_seen FROM devices WHERE id = 'dev1'`).
		Scan(&name, &ua, &key, &client, &created, &seen)
	if err != nil {
		t.Fatal(err)
	}
	if name != "Kitchen iPad" || ua != "Safari" || key != `{"kty":"EC"}` || client != 1 || created != t0.UnixMilli() || seen != created {
		t.Errorf("device = %q %q %q client %d created %d seen %d", name, ua, key, client, created, seen)
	}
	if err := pool.QueryRow(ctx, `SELECT used_at FROM invites WHERE token_hash = $1`, inv).Scan(&used); err != nil || used == nil || *used != t0.UnixMilli() {
		t.Errorf("invite used_at = %v, %v", used, err)
	}
	// Spent: the same invite does nothing the second time, with another device and key.
	if err := enroll(s, inv, "dev2", "x", "k2", "tok-2"); !errors.Is(err, ErrInvalidInvite) {
		t.Errorf("second use: %v", err)
	}
	// An invite without a name takes the request's name, and with neither it is "Device".
	for i, tc := range []struct{ invite, request, want string }{{"i-a", "From request", "From request"}, {"i-b", "", "Device"}} {
		h := seedInvite(t, pool, tc.invite, "", t0.Add(time.Minute))
		id := "named" + string(rune('0'+i))
		if err := enroll(s, h, id, tc.request, "k", "tok-"+tc.invite); err != nil {
			t.Fatal(err)
		}
		if err := pool.QueryRow(ctx, `SELECT name FROM devices WHERE id = $1`, id).Scan(&name); err != nil || name != tc.want {
			t.Errorf("name = %q (%v), want %q", name, err, tc.want)
		}
	}
}

func TestEnrollRefusesExpiredAndUnknownInvites(t *testing.T) {
	s, pool := syncFixture(t)
	expired := seedInvite(t, pool, "old", "", t0) // expires_at must be after now
	if err := enroll(s, expired, "d", "n", "k", "t"); !errors.Is(err, ErrInvalidInvite) {
		t.Errorf("expired: %v", err)
	}
	if err := enroll(s, auth.HashToken("never issued"), "d", "n", "k", "t"); !errors.Is(err, ErrInvalidInvite) {
		t.Errorf("unknown: %v", err)
	}
	var n int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM devices`).Scan(&n); err != nil || n != 0 {
		t.Errorf("%d devices, %v", n, err)
	}
}

func TestEnrollSpendsAnInviteOnlyOnce(t *testing.T) {
	s, pool := syncFixture(t)
	inv := seedInvite(t, pool, "race", "", t0.Add(time.Minute))
	var won, lost atomic.Int32
	var wg sync.WaitGroup
	for i := range 8 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			id := string(rune('a' + i))
			switch err := enroll(s, inv, id, "n", "k", "tok-"+id); {
			case err == nil:
				won.Add(1)
			case errors.Is(err, ErrInvalidInvite):
				lost.Add(1)
			default:
				t.Error(err)
			}
		}()
	}
	wg.Wait()
	if won.Load() != 1 || lost.Load() != 7 {
		t.Errorf("won %d, lost %d, want 1 and 7", won.Load(), lost.Load())
	}
}

// A device that cannot be written must not use up the invite: the spend and the insert are one transaction.
func TestEnrollFailureKeepsTheInvite(t *testing.T) {
	s, pool := syncFixture(t)
	first := seedInvite(t, pool, "first", "", t0.Add(time.Minute))
	if err := enroll(s, first, "d1", "n", "k", "same-token"); err != nil {
		t.Fatal(err)
	}
	second := seedInvite(t, pool, "second", "", t0.Add(time.Minute))
	// The same token hash again violates the unique constraint on devices.
	if err := enroll(s, second, "d2", "n", "k", "same-token"); err == nil || errors.Is(err, ErrInvalidInvite) {
		t.Fatalf("err = %v, want a database error", err)
	}
	if err := enroll(s, second, "d2", "n", "k", "another-token"); err != nil {
		t.Errorf("the invite was used up by the failed attempt: %v", err)
	}
}

func TestDeviceByToken(t *testing.T) {
	s, pool := syncFixture(t)
	ctx := context.Background()
	inv := seedInvite(t, pool, "inv", "", t0.Add(time.Minute))
	if err := enroll(s, inv, "dev1", "n", `{"key":1}`, "tok"); err != nil {
		t.Fatal(err)
	}
	lastSeen := func() int64 {
		var v int64
		if err := pool.QueryRow(ctx, `SELECT last_seen FROM devices WHERE id = 'dev1'`).Scan(&v); err != nil {
			t.Fatal(err)
		}
		return v
	}

	d, err := s.DeviceByToken(ctx, auth.HashToken("tok"))
	if err != nil || d.ID != "dev1" || d.ClientID != 1 || d.KeyThumbprint != `{"key":1}` {
		t.Fatalf("device = %+v, %v", d, err)
	}
	if _, err := s.DeviceByToken(ctx, auth.HashToken("other")); !errors.Is(err, ErrUnknownToken) {
		t.Errorf("unknown token: %v", err)
	}

	// last_seen is written at most once a minute.
	s.now = func() time.Time { return t0.Add(30 * time.Second) }
	if _, err := s.DeviceByToken(ctx, auth.HashToken("tok")); err != nil || lastSeen() != t0.UnixMilli() {
		t.Errorf("30 s later: last_seen = %d, %v (should be unchanged)", lastSeen(), err)
	}
	s.now = func() time.Time { return t0.Add(2 * time.Minute) }
	if _, err := s.DeviceByToken(ctx, auth.HashToken("tok")); err != nil || lastSeen() != t0.Add(2*time.Minute).UnixMilli() {
		t.Errorf("2 min later: last_seen = %d, %v", lastSeen(), err)
	}

	// Revoking (the admin deletes the row) makes the token unknown at once.
	if _, err := pool.Exec(ctx, `DELETE FROM devices WHERE id = 'dev1'`); err != nil {
		t.Fatal(err)
	}
	if _, err := s.DeviceByToken(ctx, auth.HashToken("tok")); !errors.Is(err, ErrUnknownToken) {
		t.Errorf("after revoke: %v", err)
	}
}

func TestHashMatchesTheAdminInviteHash(t *testing.T) {
	// The admin store stores sha256 of the token string; Enroll looks it up with auth.HashToken. They must agree, or no
	// enrollment could ever succeed (the integration test in syncapi covers it end to end).
	a := auth.HashToken("abc")
	if len(a) != 32 || !bytes.Equal(a, auth.HashToken("abc")) {
		t.Error("hash is not stable")
	}
}

// The public API's role has the rows it needs and nothing more: no DDL, no ownership, no reading accounts or the migration records'
// content beyond what it checks, no deleting. The database enforces it, not the Go code.
func TestSyncRoleHasRowRightsOnly(t *testing.T) {
	s, owner := syncFixture(t)
	ctx := context.Background()
	t.Cleanup(func() { _, _ = owner.Exec(ctx, `TRUNCATE docs`) })
	for _, q := range []string{
		`SELECT * FROM clients`,
		`SELECT * FROM meta`,
		`INSERT INTO clients (name, created_at) VALUES ('x', 0)`,
		`INSERT INTO invites (token_hash, client_id, created_at, expires_at) VALUES ('x', 1, 0, 0)`,
		`INSERT INTO schema_migrations (name, applied_at) VALUES ('9999_x', 0)`,
		`UPDATE devices SET name = 'x'`,
		`UPDATE devices SET token_hash = 'x'`,
		`UPDATE invites SET expires_at = 0`,
		`DELETE FROM devices`,
		`DELETE FROM invites`,
		`DELETE FROM docs`,
		`TRUNCATE docs`,
		`CREATE TABLE evil (a int)`,
		`ALTER TABLE devices ADD COLUMN evil int`,
		`DROP TABLE devices`,
	} {
		_, err := s.db.Exec(ctx, q)
		var pgErr *pgconn.PgError
		if !errors.As(err, &pgErr) || pgErr.Code != "42501" { // insufficient_privilege, not some other failure
			t.Errorf("%s: err = %v, want a permission error", q, err)
		}
	}
	// What it does need works, including a foreign-key insert (the check runs as the table owner, so no grant on clients).
	if _, err := s.db.Exec(ctx, `INSERT INTO docs (client_id, id, version, created_at, updated_at, data) VALUES (1, repeat('a', 32), 1, 0, 0, 'x')`); err != nil {
		t.Errorf("insert into docs: %v", err)
	}
	if _, err := s.db.Exec(ctx, `UPDATE docs SET version = 2, deleted = true, data = '' WHERE id = repeat('a', 32)`); err != nil {
		t.Errorf("tombstone update: %v", err)
	}
	var n int
	if err := s.db.QueryRow(ctx, `SELECT count(*) FROM docs`).Scan(&n); err != nil || n != 1 {
		t.Errorf("select docs: %d, %v", n, err)
	}
}

func TestSyncLoginNeedsItsOwnCertificate(t *testing.T) {
	pgEnv(t, "harper_sync", "wrongcn") // a certificate from the same CA with another common name
	pool, err := Open(context.Background(), "")
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	if err := pool.Ping(context.Background()); err == nil {
		t.Error("harper_sync logged in with another role's certificate")
	}
}

func TestSchemaCurrent(t *testing.T) {
	s, _ := syncFixture(t)
	ctx := context.Background()
	ok, err := SchemaCurrent(ctx, s.db, Migrations)
	if err != nil || !ok {
		t.Fatalf("after the migrations: %v, %v", ok, err)
	}
	// A binary that expects a file the database has not got is not current.
	newer := fstest.MapFS{"migrations/9999_future.sql": {Data: []byte("SELECT 1")}}
	for name, f := range map[string]fs.FS{"embedded": Migrations, "embedded plus one": mergeFS{Migrations, newer}} {
		ok, err := SchemaCurrent(ctx, s.db, f)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if want := name == "embedded"; ok != want {
			t.Errorf("%s: current = %v, want %v", name, ok, want)
		}
	}
}

// mergeFS lists the files of both file systems under migrations/ (only Glob, which SchemaCurrent uses, is needed).
type mergeFS struct{ a, b fs.FS }

func (m mergeFS) Open(name string) (fs.File, error) {
	if f, err := m.a.Open(name); err == nil {
		return f, nil
	}
	return m.b.Open(name)
}

func (m mergeFS) ReadDir(name string) ([]fs.DirEntry, error) {
	x, err := fs.ReadDir(m.a, name)
	if err != nil {
		return nil, err
	}
	y, _ := fs.ReadDir(m.b, name)
	return append(x, y...), nil
}

// Row security keeps the notes away from the admin role, which owns the tables: with FORCE it applies to the owner too, and the only
// policy is for harper_sync. The admin sees no row and cannot write one. (It is a seatbelt: the owner can still change policies or
// switch row security off, so this is not claimed to stop whoever holds the owner's credential.)
func TestAdminRoleCannotSeeOrWriteNotes(t *testing.T) {
	s, owner := syncFixture(t) // owner is the harper_admin pool
	ctx := context.Background()
	t.Cleanup(func() { _, _ = owner.Exec(ctx, `TRUNCATE docs`) })

	var rls, forced bool
	if err := owner.QueryRow(ctx, `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'docs'`).Scan(&rls, &forced); err != nil || !rls || !forced {
		t.Fatalf("row security on docs: enabled %v, forced %v, %v", rls, forced, err)
	}

	if _, err := s.db.Exec(ctx, `INSERT INTO docs (client_id, id, version, created_at, updated_at, data) VALUES (1, repeat('b', 32), 1, 0, 0, 'a note')`); err != nil {
		t.Fatal(err)
	}
	count := func(p *pgxpool.Pool) int {
		var n int
		if err := p.QueryRow(ctx, `SELECT count(*) FROM docs`).Scan(&n); err != nil {
			t.Fatal(err)
		}
		return n
	}
	if got := count(s.db); got != 1 {
		t.Fatalf("harper_sync sees %d notes, want 1", got)
	}
	if got := count(owner); got != 0 {
		t.Errorf("harper_admin sees %d notes, want 0", got)
	}
	var data string
	if err := owner.QueryRow(ctx, `SELECT data FROM docs WHERE id = repeat('b', 32)`).Scan(&data); err == nil {
		t.Errorf("harper_admin read a note: %q", data)
	}
	// Writes: an insert is refused, an update or delete matches no row.
	_, err := owner.Exec(ctx, `INSERT INTO docs (client_id, id, version, created_at, updated_at) VALUES (1, repeat('c', 32), 1, 0, 0)`)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "42501" {
		t.Errorf("harper_admin insert into docs: %v, want a row-security error", err)
	}
	for _, q := range []string{`UPDATE docs SET data = 'changed'`, `DELETE FROM docs`} {
		tag, err := owner.Exec(ctx, q)
		if err != nil || tag.RowsAffected() != 0 {
			t.Errorf("%s as harper_admin: %v rows, %v, want 0 rows", q, tag.RowsAffected(), err)
		}
	}
	if err := s.db.QueryRow(ctx, `SELECT data FROM docs WHERE id = repeat('b', 32)`).Scan(&data); err != nil || data != "a note" {
		t.Errorf("the note after the admin's attempts: %q, %v", data, err)
	}
}
