package store

import (
	"context"
	"errors"
	"strings"
	"testing"
)

var words1 = Setting{Words: []string{"Wails"}, Ignored: []string{"42"}}

func TestPutSettingCompareAndSet(t *testing.T) {
	s, owner := syncFixture(t)
	ctx := context.Background()
	reset := func() { _, _ = owner.Exec(ctx, `TRUNCATE settings`) }
	reset()
	t.Cleanup(reset)

	if _, err := s.GetSetting(ctx, 1); !errors.Is(err, ErrSettingNotFound) {
		t.Fatalf("before any write: %v", err)
	}
	v, err := s.PutSetting(ctx, 1, 0, words1)
	if err != nil || v.Version != 1 {
		t.Fatalf("create = %+v, %v", v, err)
	}
	if v, err = s.PutSetting(ctx, 1, 1, Setting{}); err != nil || v.Version != 2 {
		t.Fatalf("update = %+v, %v", v, err)
	}
	// a stale base changes nothing and returns the stored row
	cur, err := s.PutSetting(ctx, 1, 1, words1)
	if !errors.Is(err, ErrSettingConflict) || cur.Version != 2 || len(cur.Words) != 0 || cur.Words == nil {
		t.Errorf("stale = %+v, %v", cur, err)
	}
	// base 0 over an existing row is a conflict, and a base for an account with no row is a conflict with no copy
	if cur, err := s.PutSetting(ctx, 1, 0, words1); !errors.Is(err, ErrSettingConflict) || cur.Version != 2 {
		t.Errorf("create over existing: %+v, %v", cur, err)
	}
	if cur, err := s.PutSetting(ctx, 3, 3, words1); !errors.Is(err, ErrSettingConflict) || cur.Version != 0 {
		t.Errorf("base for a missing row: %+v, %v", cur, err)
	}
	// size limit, as insert and as update
	big := Setting{Words: []string{strings.Repeat("x", MaxSettingData)}}
	if _, err := s.PutSetting(ctx, 2, 0, big); !errors.Is(err, ErrSettingTooLarge) {
		t.Errorf("insert over the limit: %v", err)
	}
	if _, err := s.PutSetting(ctx, 1, 2, big); !errors.Is(err, ErrSettingTooLarge) {
		t.Errorf("update over the limit: %v", err)
	}
}

// The account comes from the device: another account has its own row under the same key.
func TestSettingsAreScopedToTheAccount(t *testing.T) {
	s, owner := syncFixture(t)
	ctx := context.Background()
	if _, err := owner.Exec(ctx, `INSERT INTO clients (name, created_at) VALUES ('second', 0)`); err != nil {
		t.Fatal(err)
	}
	var two int64
	if err := owner.QueryRow(ctx, `SELECT id FROM clients WHERE name = 'second'`).Scan(&two); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = owner.Exec(ctx, `TRUNCATE settings`)
		_, _ = owner.Exec(ctx, `DELETE FROM clients WHERE name = 'second'`)
	})
	if _, err := s.PutSetting(ctx, 1, 0, words1); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetSetting(ctx, two); !errors.Is(err, ErrSettingNotFound) {
		t.Errorf("other account reads: %v", err)
	}
	if v, err := s.PutSetting(ctx, two, 0, Setting{}); err != nil || v.Version != 1 {
		t.Errorf("other account creates the same key: %+v, %v", v, err)
	}
	// the admin role sees none of it (row security)
	var n int
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM settings`).Scan(&n); err != nil || n != 0 {
		t.Errorf("harper_admin sees %d rows, %v", n, err)
	}
}
