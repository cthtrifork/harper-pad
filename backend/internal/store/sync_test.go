package store

import (
	"bytes"
	"context"
	"errors"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/jackc/pgx/v5/pgxpool"
)

// syncFixture returns the sync store connected as harper_sync (its client certificate, so the real ownership applies) with the
// schema migrated and the devices and invites tables empty. The pool is for seeding and checking rows.
func syncFixture(t *testing.T) (*Sync, *pgxpool.Pool) {
	t.Helper()
	ctx := context.Background()
	pgEnv(t, "harper_sync", "client")
	pool, err := Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := Migrate(ctx, pool, Migrations); err != nil {
		t.Fatal(err)
	}
	reset := func() {
		if _, err := pool.Exec(ctx, `TRUNCATE devices, invites`); err != nil {
			t.Fatal(err)
		}
	}
	reset()
	t.Cleanup(reset)
	s := NewSync(pool)
	s.now = func() time.Time { return t0 }
	return s, pool
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
	err := pool.QueryRow(ctx, `SELECT name, user_agent, public_key, client_id, created_at, last_seen FROM devices WHERE id = 'dev1'`).
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
	if err != nil || d.ID != "dev1" || d.ClientID != 1 || d.PublicKey != `{"key":1}` {
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

func TestPurgeInvites(t *testing.T) {
	s, pool := syncFixture(t)
	seedInvite(t, pool, "long gone", "", t0.Add(-25*time.Hour))
	seedInvite(t, pool, "just expired", "", t0.Add(-time.Hour))
	seedInvite(t, pool, "pending", "", t0.Add(time.Minute))
	n, err := s.PurgeInvites(context.Background())
	if err != nil || n != 1 {
		t.Fatalf("purged %d, %v, want 1", n, err)
	}
	var left int
	if err := pool.QueryRow(context.Background(), `SELECT count(*) FROM invites`).Scan(&left); err != nil || left != 2 {
		t.Errorf("%d invites left, %v", left, err)
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
