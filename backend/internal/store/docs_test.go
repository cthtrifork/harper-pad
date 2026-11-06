package store

import (
	"context"
	"errors"
	"strings"
	"sync"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	docA = "00000000000000000000000000000001"
	docB = "00000000000000000000000000000002"
	docC = "00000000000000000000000000000003"
)

// docsFixture is syncFixture with an empty docs table (TRUNCATE is not subject to row security, so the owner can empty it).
func docsFixture(t *testing.T) (*Sync, *pgxpool.Pool) {
	t.Helper()
	s, owner := syncFixture(t)
	reset := func() {
		if _, err := owner.Exec(context.Background(), `TRUNCATE docs`); err != nil {
			t.Fatal(err)
		}
	}
	reset()
	t.Cleanup(reset)
	return s, owner
}

func put(t *testing.T, s *Sync, id string, base DocBase, updated int64, data string) Doc {
	t.Helper()
	d, err := s.PutDoc(context.Background(), 1, id, base, DocWrite{CreatedAt: 1, UpdatedAt: updated, Data: data})
	if err != nil {
		t.Fatalf("PutDoc(%s, %+v) = %v", id, base, err)
	}
	return d
}

func TestPutDocCompareAndSet(t *testing.T) {
	s, _ := docsFixture(t)
	ctx := context.Background()

	d := put(t, s, docA, DocBase{}, 10, "one")
	if d.Version != 1 || d.UpdatedAt != 10 || d.Data != "one" {
		t.Fatalf("created = %+v", d)
	}
	d = put(t, s, docA, DocBase{Version: 1, UpdatedAt: 10}, 20, "two")
	if d.Version != 2 {
		t.Fatalf("updated = %+v", d)
	}

	// a stale base changes nothing and returns the stored row
	cur, err := s.PutDoc(ctx, 1, docA, DocBase{Version: 1, UpdatedAt: 10}, DocWrite{UpdatedAt: 30, Data: "stale"})
	if !errors.Is(err, ErrConflict) || cur.Version != 2 || cur.Data != "two" || cur.UpdatedAt != 20 {
		t.Fatalf("stale write = %+v, %v", cur, err)
	}
	// the version alone is not enough: updatedAt must match too
	if _, err := s.PutDoc(ctx, 1, docA, DocBase{Version: 2, UpdatedAt: 99}, DocWrite{UpdatedAt: 30, Data: "x"}); !errors.Is(err, ErrConflict) {
		t.Errorf("wrong base updatedAt: %v", err)
	}
	// base 0 over an existing draft is a conflict, not an overwrite
	if cur, err := s.PutDoc(ctx, 1, docA, DocBase{}, DocWrite{UpdatedAt: 30, Data: "x"}); !errors.Is(err, ErrConflict) || cur.Data != "two" {
		t.Errorf("create over existing: %+v, %v", cur, err)
	}
	// a base for a draft the server lacks is a conflict with no copy
	if cur, err := s.PutDoc(ctx, 1, docB, DocBase{Version: 4, UpdatedAt: 1}, DocWrite{UpdatedAt: 30, Data: "x"}); !errors.Is(err, ErrConflict) || cur.ID != "" {
		t.Errorf("base for a missing draft: %+v, %v", cur, err)
	}
	if _, err := s.GetDoc(ctx, 1, docB); !errors.Is(err, ErrDocNotFound) {
		t.Errorf("refused create left a row: %v", err)
	}
}

func TestPutDocTombstone(t *testing.T) {
	s, owner := docsFixture(t)
	ctx := context.Background()
	put(t, s, docA, DocBase{}, 10, "secret text")

	d, err := s.PutDoc(ctx, 1, docA, DocBase{Version: 1, UpdatedAt: 10}, DocWrite{UpdatedAt: 20, Deleted: true, Data: "must be dropped"})
	if err != nil || d.Version != 2 || !d.Deleted || d.Data != "" {
		t.Fatalf("tombstone = %+v, %v", d, err)
	}
	got, err := s.GetDoc(ctx, 1, docA)
	if err != nil || !got.Deleted || got.Data != "" || got.UpdatedAt != 20 {
		t.Errorf("stored tombstone = %+v, %v", got, err)
	}
	// the tombstone is a row with a version: an edit on top of it brings the draft back
	d = put(t, s, docA, DocBase{Version: 2, UpdatedAt: 20}, 30, "revived")
	if d.Version != 3 || d.Deleted || d.Data != "revived" {
		t.Errorf("revived = %+v", d)
	}
	// a tombstone for an id the server never had is stored
	if d, err := s.PutDoc(ctx, 1, docB, DocBase{}, DocWrite{UpdatedAt: 5, Deleted: true}); err != nil || d.Version != 1 || !d.Deleted {
		t.Errorf("tombstone for a new id = %+v, %v", d, err)
	}
	// the text really is gone from the table, not only from the response
	var n int
	if err := owner.QueryRow(ctx, `SELECT count(*) FROM docs WHERE deleted AND data <> ''`).Scan(&n); err != nil || n != 0 {
		t.Errorf("tombstones with text: %d, %v", n, err)
	}
}

func TestListDocs(t *testing.T) {
	s, _ := docsFixture(t)
	ctx := context.Background()
	for _, id := range []string{docC, docA, docB} {
		put(t, s, id, DocBase{}, 10, "text of "+id)
	}
	put(t, s, docB, DocBase{Version: 1, UpdatedAt: 10}, 11, "")
	if _, err := s.PutDoc(ctx, 1, docB, DocBase{Version: 2, UpdatedAt: 11}, DocWrite{UpdatedAt: 12, Deleted: true}); err != nil {
		t.Fatal(err)
	}

	all, err := s.ListDocs(ctx, 1, "", 10)
	if err != nil || len(all) != 3 || all[0].ID != docA || all[1].ID != docB || all[2].ID != docC {
		t.Fatalf("list = %+v, %v", all, err)
	}
	if !all[1].Deleted || all[1].Version != 3 || all[1].UpdatedAt != 12 {
		t.Errorf("tombstone entry = %+v", all[1])
	}
	page, _ := s.ListDocs(ctx, 1, "", 2)
	rest, _ := s.ListDocs(ctx, 1, page[len(page)-1].ID, 2)
	if len(page) != 2 || len(rest) != 1 || rest[0].ID != docC {
		t.Errorf("pages = %+v then %+v", page, rest)
	}
	if none, err := s.ListDocs(ctx, 1, docC, 10); err != nil || none == nil || len(none) != 0 {
		t.Errorf("past the end = %#v, %v", none, err)
	}
}

// Every query has the account in its WHERE: another client account sees none of these drafts and can use the same ids.
func TestDocsAreScopedToTheAccount(t *testing.T) {
	s, owner := docsFixture(t)
	ctx := context.Background()
	if _, err := owner.Exec(ctx, `INSERT INTO clients (name, created_at) VALUES ('second', 0)`); err != nil {
		t.Fatal(err)
	}
	var two int64
	if err := owner.QueryRow(ctx, `SELECT id FROM clients WHERE name = 'second'`).Scan(&two); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = owner.Exec(ctx, `TRUNCATE docs`)
		_, _ = owner.Exec(ctx, `DELETE FROM clients WHERE name = 'second'`)
	})

	put(t, s, docA, DocBase{}, 10, "mine")
	if list, err := s.ListDocs(ctx, two, "", 10); err != nil || len(list) != 0 {
		t.Errorf("other account lists %+v, %v", list, err)
	}
	if _, err := s.GetDoc(ctx, two, docA); !errors.Is(err, ErrDocNotFound) {
		t.Errorf("other account reads: %v", err)
	}
	if _, err := s.PutDoc(ctx, two, docA, DocBase{Version: 1, UpdatedAt: 10}, DocWrite{UpdatedAt: 20, Data: "theirs"}); !errors.Is(err, ErrConflict) {
		t.Errorf("other account writes on my base: %v", err)
	}
	if d, err := s.PutDoc(ctx, two, docA, DocBase{}, DocWrite{UpdatedAt: 20, Data: "theirs"}); err != nil || d.Version != 1 {
		t.Errorf("other account creates the same id: %+v, %v", d, err)
	}
	if d, err := s.GetDoc(ctx, 1, docA); err != nil || d.Data != "mine" || d.Version != 1 {
		t.Errorf("first account's draft = %+v, %v", d, err)
	}
}

// Two devices that create the same id at once: exactly one wins and the other gets a conflict with the winner's row.
func TestConcurrentFirstWrites(t *testing.T) {
	s, _ := docsFixture(t)
	ctx := context.Background()
	const n = 8
	var wg sync.WaitGroup
	results := make([]error, n)
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, results[i] = s.PutDoc(ctx, 1, docA, DocBase{}, DocWrite{UpdatedAt: int64(100 + i), Data: strings.Repeat("x", i+1)})
		}()
	}
	wg.Wait()
	won := 0
	for _, err := range results {
		switch {
		case err == nil:
			won++
		case !errors.Is(err, ErrConflict):
			t.Errorf("unexpected error: %v", err)
		}
	}
	if won != 1 {
		t.Fatalf("%d writers won, want 1", won)
	}
	if d, err := s.GetDoc(ctx, 1, docA); err != nil || d.Version != 1 {
		t.Errorf("stored = %+v, %v", d, err)
	}
}

// The same compare-and-set on an existing row: the row lock lets one writer through per version.
func TestConcurrentUpdates(t *testing.T) {
	s, _ := docsFixture(t)
	ctx := context.Background()
	put(t, s, docA, DocBase{}, 10, "start")
	const n = 8
	var wg sync.WaitGroup
	results := make([]error, n)
	for i := range n {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, results[i] = s.PutDoc(ctx, 1, docA, DocBase{Version: 1, UpdatedAt: 10}, DocWrite{UpdatedAt: int64(100 + i), Data: "w"})
		}()
	}
	wg.Wait()
	won := 0
	for _, err := range results {
		if err == nil {
			won++
		} else if !errors.Is(err, ErrConflict) {
			t.Errorf("unexpected error: %v", err)
		}
	}
	if d, _ := s.GetDoc(ctx, 1, docA); won != 1 || d.Version != 2 {
		t.Errorf("%d writers won, version %d; want 1 and 2", won, d.Version)
	}
}

// What the database refuses, whatever the service checks: ids that are not 32 hex characters and text over MaxDocData (2 MiB).
func TestDocConstraints(t *testing.T) {
	s, _ := docsFixture(t)
	ctx := context.Background()
	if _, err := s.PutDoc(ctx, 1, "not-an-id", DocBase{}, DocWrite{UpdatedAt: 1, Data: "x"}); err == nil || errors.Is(err, ErrConflict) {
		t.Errorf("bad id accepted: %v", err)
	}
	// MaxDocData is what the CHECK allows: that much is stored, one byte more comes back as ErrTooLarge, as an insert and as an update.
	d, err := s.PutDoc(ctx, 1, docA, DocBase{}, DocWrite{UpdatedAt: 1, Data: strings.Repeat("x", MaxDocData)})
	if err != nil {
		t.Fatalf("MaxDocData bytes refused: %v", err)
	}
	over := DocWrite{UpdatedAt: 2, Data: strings.Repeat("x", MaxDocData+1)}
	if _, err := s.PutDoc(ctx, 1, docA, DocBase{Version: d.Version, UpdatedAt: d.UpdatedAt}, over); !errors.Is(err, ErrTooLarge) {
		t.Errorf("update over the limit: %v, want ErrTooLarge", err)
	}
	if _, err := s.PutDoc(ctx, 1, docB, DocBase{}, over); !errors.Is(err, ErrTooLarge) {
		t.Errorf("insert over the limit: %v, want ErrTooLarge", err)
	}
}

// harper_admin owns the table but has no policy on it, so the notes are out of its reach (backend/README.md).
func TestAdminRoleSeesNoDocs(t *testing.T) {
	s, owner := docsFixture(t)
	put(t, s, docA, DocBase{}, 10, "private")
	var n int
	if err := owner.QueryRow(context.Background(), `SELECT count(*) FROM docs`).Scan(&n); err != nil || n != 0 {
		t.Errorf("harper_admin sees %d rows, %v", n, err)
	}
}
