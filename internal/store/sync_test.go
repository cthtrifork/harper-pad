package store

import (
	"database/sql"
	"encoding/json"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

func TestContentHashFixtures(t *testing.T) {
	raw, err := os.ReadFile("testdata/contenthash.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct{ Format, Content, Hash string }
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		if got := ContentHash(c.Format, c.Content); got != c.Hash {
			t.Errorf("ContentHash(%q, %q) = %s, want %s", c.Format, c.Content, got, c.Hash)
		}
	}
}

// rawDB opens the file with no schema checks, to set up an old layout or to run an older build's statements.
func rawDB(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	db.SetMaxOpenConns(1)
	return db
}

func changes(t *testing.T, s *Store) Changes {
	t.Helper()
	c, err := s.Changes()
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestNothingChangesWithSyncOff(t *testing.T) {
	s, _ := open(t)
	a, _ := s.Save(Draft{Content: "a"})
	if err := s.Delete(a.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM sync_state`).Scan(&n); err != nil || n != 0 {
		t.Errorf("sync_state has %d rows with sync off, %v", n, err)
	}
	if c := changes(t, s); len(c.Deleted) != 0 {
		t.Errorf("a draft the server never saw is a pending delete: %v", c.Deleted)
	}
}

func TestChangesFollowTheText(t *testing.T) {
	s, _ := open(t)
	tick(s)
	a, _ := s.Save(Draft{Content: "one"})
	b, _ := s.Save(Draft{Content: "two"})
	if got := changes(t, s).Changed; !reflect.DeepEqual(got, []string{a.ID, b.ID}) {
		t.Fatalf("new drafts are changed: %v", got)
	}
	for _, d := range []Draft{a, b} {
		if err := s.MarkSynced(d.ID, SyncState{Hash: ContentHash(d.Format, d.Content), UpdatedAt: d.UpdatedAt, Version: 1}); err != nil {
			t.Fatal(err)
		}
	}
	if c := changes(t, s); len(c.Changed) != 0 || len(c.Deleted) != 0 {
		t.Fatalf("after syncing: %+v", c)
	}
	// Saving the same text again changes the time but not the text: not a change.
	if _, err := s.Save(Draft{ID: a.ID, Content: "one"}); err != nil {
		t.Fatal(err)
	}
	if c := changes(t, s); len(c.Changed) != 0 {
		t.Errorf("same text counted as a change: %+v", c)
	}
	if _, err := s.Save(Draft{ID: a.ID, Content: "one more"}); err != nil {
		t.Fatal(err)
	}
	if got := changes(t, s).Changed; !reflect.DeepEqual(got, []string{a.ID}) {
		t.Errorf("an edit: %v", got)
	}
	// The format is part of the hash.
	if _, err := s.Save(Draft{ID: b.ID, Content: "two", Format: FormatText}); err != nil {
		t.Fatal(err)
	}
	if got := changes(t, s).Changed; !reflect.DeepEqual(got, []string{a.ID, b.ID}) {
		t.Errorf("a format change: %v", got)
	}
}

func TestDeleteIsPendingUntilAcknowledged(t *testing.T) {
	s, _ := open(t)
	a, _ := s.Save(Draft{Content: "one"})
	_ = s.MarkSynced(a.ID, SyncState{Hash: ContentHash(a.Format, a.Content), UpdatedAt: a.UpdatedAt, Version: 3})
	if err := s.Delete(a.ID); err != nil {
		t.Fatal(err)
	}
	if got := changes(t, s).Deleted; !reflect.DeepEqual(got, []string{a.ID}) {
		t.Fatalf("pending deletes: %v", got)
	}
	// Undo: saving the id again with the same text is no change, and no longer a pending delete.
	if _, err := s.Save(Draft{ID: a.ID, Content: "one", CreatedAt: a.CreatedAt}); err != nil {
		t.Fatal(err)
	}
	if c := changes(t, s); len(c.Deleted) != 0 || len(c.Changed) != 0 {
		t.Fatalf("after undo: %+v", c)
	}
	// Deleted again, then the server accepts the delete.
	_ = s.Delete(a.ID)
	if err := s.MarkSynced(a.ID, SyncState{UpdatedAt: 9, Deleted: true, Version: 4}); err != nil {
		t.Fatal(err)
	}
	if c := changes(t, s); len(c.Deleted) != 0 {
		t.Fatalf("acknowledged delete still pending: %+v", c)
	}
	st, ok, err := s.SyncState(a.ID)
	if err != nil || !ok || !st.Deleted || st.Version != 4 {
		t.Errorf("state = %+v, %v, %v", st, ok, err)
	}
	if _, ok, _ := s.SyncState("00000000000000000000000000000000"); ok {
		t.Error("state for an unknown id")
	}
}

func TestApplyRemoteKeepsTheServersTimes(t *testing.T) {
	s, _ := open(t)
	tick(s)
	local, _ := s.Save(Draft{Content: "local"})
	if err := s.SetFile(local.ID, "/tmp/note.md", 77); err != nil {
		t.Fatal(err)
	}
	got, err := s.ApplyRemote(Draft{ID: local.ID, Format: FormatMarkdown, Content: "# From the server\n- [x] done", Title: "From the server", TasksTotal: 1, TasksDone: 1, CreatedAt: 1000, UpdatedAt: 2000}, 5)
	if err != nil {
		t.Fatal(err)
	}
	if got.CreatedAt != 1000 || got.UpdatedAt != 2000 || got.Content != "# From the server\n- [x] done" {
		t.Errorf("applied draft = %+v", got)
	}
	if got.FilePath != "/tmp/note.md" || got.FileMTime != 77 {
		t.Errorf("the file link was lost: %+v", got)
	}
	l, _ := s.List(10, 0)
	if len(l.Drafts) != 1 || l.Drafts[0].Title != "From the server" || l.Drafts[0].TasksDone != 1 {
		t.Errorf("the page's summary was not stored: %+v", l.Drafts)
	}
	if c := changes(t, s); len(c.Changed) != 0 {
		t.Errorf("an applied draft counts as changed: %+v", c)
	}
	st, _, _ := s.SyncState(local.ID)
	if st.Version != 5 || st.UpdatedAt != 2000 || st.Hash != ContentHash(FormatMarkdown, got.Content) {
		t.Errorf("state = %+v", st)
	}
	// A draft new to this device.
	other := "0123456789abcdef0123456789abcdef"
	if _, err := s.ApplyRemote(Draft{ID: other, Content: "x", CreatedAt: 1, UpdatedAt: 2}, 1); err != nil {
		t.Fatal(err)
	}
}

func TestApplyRemoteChecksWhatSaveChecks(t *testing.T) {
	s, _ := open(t)
	id := "0123456789abcdef0123456789abcdef"
	for name, d := range map[string]Draft{
		"format":  {ID: id, Format: "html", Content: "x", CreatedAt: 1, UpdatedAt: 1},
		"utf8":    {ID: id, Content: "\xff", CreatedAt: 1, UpdatedAt: 1},
		"size":    {ID: id, Content: string(make([]byte, MaxContentBytes+1)), CreatedAt: 1, UpdatedAt: 1},
		"id":      {ID: "nope", Content: "x", CreatedAt: 1, UpdatedAt: 1},
		"times":   {ID: id, Content: "x"},
		"no time": {ID: id, Content: "x", CreatedAt: 1},
	} {
		if _, err := s.ApplyRemote(d, 1); err == nil {
			t.Errorf("%s: accepted", name)
		}
	}
	if l, _ := s.List(10, 0); l.Total != 0 {
		t.Errorf("a rejected draft was stored: %+v", l)
	}
}

func TestApplyRemoteDelete(t *testing.T) {
	s, _ := open(t)
	a, _ := s.Save(Draft{Content: "one"})
	_ = s.MarkSynced(a.ID, SyncState{Hash: ContentHash(a.Format, a.Content), UpdatedAt: a.UpdatedAt, Version: 1})
	if err := s.ApplyRemoteDelete(a.ID, 2, 500); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get(a.ID); err != ErrNotFound {
		t.Errorf("draft still there: %v", err)
	}
	if c := changes(t, s); len(c.Deleted) != 0 {
		t.Errorf("a delete that came from the server is pending: %+v", c)
	}
	if err := s.ApplyRemoteDelete("0123456789abcdef0123456789abcdef", 1, 1); err != nil {
		t.Errorf("deleting a draft that is not here: %v", err)
	}
}

// The database layouts of the earlier versions, written out literally.
const (
	v1Drafts = `CREATE TABLE drafts (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL,
		format TEXT NOT NULL DEFAULT 'markdown', title TEXT NOT NULL DEFAULT '', excerpt TEXT NOT NULL DEFAULT '',
		tasks TEXT NOT NULL DEFAULT '[]', tasks_total INTEGER NOT NULL DEFAULT 0, tasks_done INTEGER NOT NULL DEFAULT 0) STRICT`
	settingsTable = `CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID`
)

// A database from before sync (user_version 1 and 2) is upgraded in place, keeps its drafts, and stays at the compatibility
// level that the previous builds accept.
func TestUpgradeFromEarlierVersions(t *testing.T) {
	for _, version := range []int{1, 2} {
		path := filepath.Join(t.TempDir(), "old.db")
		raw := rawDB(t, path)
		stmts := []string{v1Drafts, settingsTable}
		if version == 2 {
			stmts = append(stmts, `ALTER TABLE drafts ADD COLUMN file_path TEXT NOT NULL DEFAULT ''`, `ALTER TABLE drafts ADD COLUMN file_mtime INTEGER NOT NULL DEFAULT 0`)
		}
		stmts = append(stmts,
			`INSERT INTO drafts (id, created_at, updated_at, data) VALUES ('0123456789abcdef0123456789abcdef', 1, 2, '{"v":1,"format":"markdown","content":"kept"}')`,
			`PRAGMA user_version = `+string(rune('0'+version)))
		for _, q := range stmts {
			if _, err := raw.Exec(q); err != nil {
				t.Fatalf("v%d %s: %v", version, q, err)
			}
		}
		_ = raw.Close()

		s, err := Open(path)
		if err != nil {
			t.Fatalf("v%d: %v", version, err)
		}
		d, err := s.Get("0123456789abcdef0123456789abcdef")
		if err != nil || d.Content != "kept" {
			t.Errorf("v%d: draft = %+v, %v", version, d, err)
		}
		if c := changes(t, s); len(c.Changed) != 1 {
			t.Errorf("v%d: an existing draft is new to the server: %+v", version, c)
		}
		var uv int
		_ = s.db.QueryRow(`PRAGMA user_version`).Scan(&uv)
		if uv != 2 {
			t.Errorf("v%d: user_version = %d, want 2 so that the previous build still opens it", version, uv)
		}
		_ = s.Close()
	}
}

// The statements of the previous build (before sync), run against a database that has sync state, must still work and must
// not damage it. They are copied from drafts.go as it was.
func TestPreviousBuildCanUseTheDatabase(t *testing.T) {
	s, path := open(t)
	a, _ := s.Save(Draft{Content: "one"})
	b, _ := s.Save(Draft{Content: "two"})
	for _, d := range []Draft{a, b} {
		_ = s.MarkSynced(d.ID, SyncState{Hash: ContentHash(d.Format, d.Content), UpdatedAt: d.UpdatedAt, Version: 7})
	}
	_ = s.Close()

	raw := rawDB(t, path)
	defer raw.Close()
	if _, err := raw.Exec(`INSERT INTO drafts (id, created_at, updated_at, data, format, title, excerpt, tasks, tasks_total, tasks_done)
		VALUES (?, 1, 99, '{"v":1,"format":"markdown","content":"edited by the old build"}', 'markdown', 't', '', '[]', 0, 0)
		ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data, format = excluded.format,
			title = excluded.title, excerpt = excluded.excerpt, tasks = excluded.tasks,
			tasks_total = excluded.tasks_total, tasks_done = excluded.tasks_done`, a.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := raw.Exec(`DELETE FROM drafts WHERE id = ?`, b.ID); err != nil {
		t.Fatal(err)
	}
	var v int64
	if err := raw.QueryRow(`SELECT version FROM sync_state WHERE id = ?`, a.ID).Scan(&v); err != nil || v != 7 {
		t.Fatalf("sync state after the old build's write: %d, %v", v, err)
	}
	_ = raw.Close()

	s2, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s2.Close()
	c := changes(t, s2)
	if !reflect.DeepEqual(c.Changed, []string{a.ID}) || !reflect.DeepEqual(c.Deleted, []string{b.ID}) {
		t.Errorf("an edit and a delete made by the old build: %+v", c)
	}
}

// IsChanged is the same definition as Changes, for one draft: the two must agree for every draft, whatever happened to it.
func TestIsChangedAgreesWithChanges(t *testing.T) {
	s, _ := open(t)
	tick(s)
	a, _ := s.Save(Draft{Content: "one"})
	b, _ := s.Save(Draft{Content: "two"})
	agree := func(step string) {
		t.Helper()
		want := map[string]bool{}
		for _, id := range changes(t, s).Changed {
			want[id] = true
		}
		ids, err := s.AllIDs()
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids {
			got, err := s.IsChanged(id)
			if err != nil || got != want[id] {
				t.Errorf("%s: IsChanged(%s) = %v, %v; Changes says %v", step, id, got, err, want[id])
			}
		}
	}
	agree("new drafts")
	for _, d := range []Draft{a, b} {
		if err := s.MarkSynced(d.ID, SyncState{Hash: ContentHash(d.Format, d.Content), UpdatedAt: d.UpdatedAt, Version: 1}); err != nil {
			t.Fatal(err)
		}
	}
	agree("after syncing")
	if _, err := s.Save(Draft{ID: a.ID, Content: "one more"}); err != nil {
		t.Fatal(err)
	}
	agree("an edit")
	if _, err := s.Save(Draft{ID: b.ID, Content: "two", Format: FormatText}); err != nil {
		t.Fatal(err)
	}
	agree("a format change")
	if got, err := s.IsChanged("0123456789abcdef0123456789abcdef"); got || err != nil {
		t.Errorf("a draft that is not stored is not changed: %v, %v", got, err)
	}
}

func TestAllIDsInOrder(t *testing.T) {
	s, _ := open(t)
	if ids, err := s.AllIDs(); err != nil || ids == nil || len(ids) != 0 {
		t.Fatalf("an empty database: %v, %v", ids, err)
	}
	tick(s)
	a, _ := s.Save(Draft{Content: "one"})
	tick(s)
	b, _ := s.Save(Draft{Content: "two"})
	// Ids sort by creation time and then by their random bytes, so two drafts made in the same millisecond have no fixed order between them.
	want := []string{a.ID, b.ID}
	sort.Strings(want)
	ids, err := s.AllIDs()
	if err != nil || !reflect.DeepEqual(ids, want) {
		t.Errorf("AllIDs = %v, %v, want %v", ids, err, want)
	}
}
