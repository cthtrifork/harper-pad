package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"
)

func open(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "harper-pad", "harper-pad.db")
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { s.Close() })
	return s, path
}

// A clock that moves forward 1 ms per call, so ordering by update time is deterministic.
func tick(s *Store) {
	t0 := time.Date(2026, 11, 3, 9, 0, 0, 0, time.UTC)
	n := 0
	s.now = func() time.Time { n++; return t0.Add(time.Duration(n) * time.Millisecond) }
}

func TestCreateGetUpdate(t *testing.T) {
	s, _ := open(t)
	tick(s)
	d, err := s.Save(Draft{Content: "# Release checklist\n- [ ] tag"})
	if err != nil {
		t.Fatal(err)
	}
	if len(d.ID) != 32 || d.Format != FormatMarkdown || d.CreatedAt == 0 || d.UpdatedAt < d.CreatedAt {
		t.Fatalf("created %+v", d)
	}
	got, err := s.Get(d.ID)
	if err != nil || !reflect.DeepEqual(got, d) {
		t.Fatalf("Get = %+v, %v; want %+v", got, err, d)
	}
	d.Content = "changed"
	d.Format = FormatText
	up, err := s.Save(d)
	if err != nil {
		t.Fatal(err)
	}
	if up.Content != "changed" || up.Format != FormatText || up.CreatedAt != d.CreatedAt || up.UpdatedAt <= d.UpdatedAt {
		t.Errorf("updated %+v from %+v", up, d)
	}
	if _, err := s.Get(strings.Repeat("0", 32)); !errors.Is(err, ErrNotFound) {
		t.Errorf("Get of an unknown id = %v", err)
	}
}

func TestIDsAreUniqueAndSortByCreation(t *testing.T) {
	s, _ := open(t)
	tick(s)
	var ids []string
	for range 50 {
		d, err := s.Save(Draft{})
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, d.ID)
	}
	seen := map[string]bool{}
	for i, id := range ids {
		if seen[id] {
			t.Fatalf("duplicate id %s", id)
		}
		seen[id] = true
		if i > 0 && id <= ids[i-1] {
			t.Errorf("id %d (%s) does not sort after the previous one (%s)", i, id, ids[i-1])
		}
	}
}

func TestListNewestFirstAndPaging(t *testing.T) {
	s, _ := open(t)
	tick(s)
	for i := range 7 {
		if _, err := s.Save(Draft{Content: fmt.Sprintf("note %d", i), Title: fmt.Sprintf("note %d", i)}); err != nil {
			t.Fatal(err)
		}
	}
	l, err := s.List(3, 0)
	if err != nil || l.Total != 7 || len(l.Drafts) != 3 || l.Drafts[0].Title != "note 6" || l.Drafts[2].Title != "note 4" {
		t.Fatalf("page 1 = %+v, %v", l, err)
	}
	l, _ = s.List(3, 6)
	if len(l.Drafts) != 1 || l.Drafts[0].Title != "note 0" {
		t.Errorf("last page = %+v", l)
	}
	// Saving an old draft again moves it to the top.
	all, _ := s.List(10, 0)
	oldest := all.Drafts[6]
	if _, err := s.Save(Draft{ID: oldest.ID, Content: "note 0 edited"}); err != nil {
		t.Fatal(err)
	}
	l, _ = s.List(1, 0)
	if l.Drafts[0].ID != oldest.ID {
		t.Errorf("the edited draft is not first: %+v", l.Drafts[0])
	}
	if l, _ := s.List(0, -5); len(l.Drafts) != 7 {
		t.Errorf("default limit and negative offset returned %d drafts", len(l.Drafts))
	}
}

func TestDeleteAndRestore(t *testing.T) {
	s, _ := open(t)
	tick(s)
	d, _ := s.Save(Draft{Content: "keep me"})
	if err := s.Delete(d.ID); err != nil {
		t.Fatal(err)
	}
	if err := s.Delete(d.ID); err != nil {
		t.Errorf("deleting twice: %v", err)
	}
	if _, err := s.Get(d.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("still there: %v", err)
	}
	// Undo: saving the same draft again brings it back with its id and creation time.
	back, err := s.Save(d)
	if err != nil || back.ID != d.ID || back.CreatedAt != d.CreatedAt || back.Content != "keep me" {
		t.Errorf("restored %+v, %v; want id %s and created %d", back, err, d.ID, d.CreatedAt)
	}
}

func TestSaveRejectsBadInput(t *testing.T) {
	s, _ := open(t)
	for name, d := range map[string]Draft{
		"format":    {Format: "rtf"},
		"id":        {ID: "../../etc/passwd"},
		"upper id":  {ID: strings.Repeat("A", 32)},
		"too big":   {Content: strings.Repeat("x", MaxContentBytes+1)},
		"not utf-8": {Content: "bad \xff\xfe bytes"},
	} {
		if _, err := s.Save(d); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
	if l, _ := s.List(10, 0); l.Total != 0 {
		t.Errorf("rejected saves left %d drafts", l.Total)
	}
	// Exactly the limit is fine.
	if _, err := s.Save(Draft{Content: strings.Repeat("x", MaxContentBytes)}); err != nil {
		t.Errorf("a draft of exactly the limit: %v", err)
	}
}

func TestUnicodeRoundTrip(t *testing.T) {
	s, _ := open(t)
	text := "Æøå — 日本語 😀\r\nline two\ttab \"quotes\" \\ back"
	d, err := s.Save(Draft{Content: text})
	if err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Get(d.ID); got.Content != text {
		t.Errorf("content changed: %q", got.Content)
	}
}

func TestSearch(t *testing.T) {
	s, _ := open(t)
	tick(s)
	for _, c := range []string{"Meeting notes about Wails", "100% done", "snake_case name", "Back\\slash", "nothing here"} {
		if _, err := s.Save(Draft{Content: c}); err != nil {
			t.Fatal(err)
		}
	}
	cases := map[string]int{
		"wails":     1, // ASCII case does not matter
		"100%":      1, // % is a literal, not a wildcard
		"%":         1,
		"e_c":       1, // _ is a literal too
		"_":         1,
		`k\s`:       1, // so is a backslash
		"content":   0, // the JSON field name is not searched
		`"format"`:  0,
		"zzz":       0,
		"":          5, // an empty query lists everything
		"  wails  ": 1,
	}
	for q, want := range cases {
		l, err := s.Search(q, 50)
		if err != nil || len(l.Drafts) != want || l.Total != want {
			t.Errorf("Search(%q) = %d drafts (total %d), %v; want %d", q, len(l.Drafts), l.Total, err, want)
		}
	}
}

// The summary the page sends is what the list shows, cut to the list's bounds, and each save replaces it.
func TestSummaries(t *testing.T) {
	s, _ := open(t)
	tick(s)
	long := strings.Repeat("word ", 100)
	tasks := []Task{{"one", true}, {"two", false}, {strings.Repeat("t", 200), true}, {"four", false}}
	d, _ := s.Save(Draft{Content: "x", Title: long, Excerpt: long, Tasks: tasks, TasksTotal: 4, TasksDone: 9})
	empty, _ := s.Save(Draft{})
	by := map[string]Summary{}
	l, _ := s.List(10, 0)
	for _, x := range l.Drafts {
		by[x.ID] = x
	}
	a := by[d.ID]
	if len([]rune(a.Title)) != 80 || len([]rune(a.Excerpt)) != 160 || len(a.Tasks) != 3 || len([]rune(a.Tasks[2].Text)) != 120 || a.TasksTotal != 4 || a.TasksDone != 4 {
		t.Errorf("summary = %+v", a)
	}
	if e := by[empty.ID]; e.Title != "Untitled" || e.Excerpt != "" || e.Tasks == nil {
		t.Errorf("empty draft = %+v", e)
	}
	d.Title, d.Tasks = "Second", nil
	if _, err := s.Save(d); err != nil {
		t.Fatal(err)
	}
	if l, _ = s.List(10, 0); l.Drafts[0].Title != "Second" || len(l.Drafts[0].Tasks) != 0 {
		t.Errorf("summary after the second save: %+v", l.Drafts[0])
	}
}

func TestSurvivesReopenAndHasNoSideFiles(t *testing.T) {
	s, path := open(t)
	d, _ := s.Save(Draft{Content: "persist me"})
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	if got, err := again.Get(d.ID); err != nil || got.Content != "persist me" {
		t.Errorf("after reopen: %+v, %v", got, err)
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 {
		t.Errorf("the folder holds %v; want only harper-pad.db (no -wal, -shm or -journal at rest)", entries)
	}
	if runtime.GOOS != "windows" {
		if info, _ := os.Stat(path); info.Mode().Perm() != 0o600 {
			t.Errorf("database mode %v, want 0600", info.Mode().Perm())
		}
	}
}

func TestConcurrentSaves(t *testing.T) {
	s, _ := open(t)
	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for j := range 5 {
				if _, err := s.Save(Draft{Content: fmt.Sprintf("g%d-%d", i, j)}); err != nil {
					t.Error(err)
				}
				if _, err := s.List(10, 0); err != nil {
					t.Error(err)
				}
			}
		}()
	}
	wg.Wait()
	if l, _ := s.List(1, 0); l.Total != 100 {
		t.Errorf("saved %d drafts, want 100", l.Total)
	}
}

func TestDamagedFileIsMovedAside(t *testing.T) {
	path := filepath.Join(t.TempDir(), "harper-pad.db")
	garbage := []byte(strings.Repeat("this is not a database ", 200))
	if err := os.WriteFile(path, garbage, 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Open(path)
	if err != nil {
		t.Fatalf("Open of a damaged file: %v", err)
	}
	defer s.Close()
	if _, err := s.Save(Draft{Content: "fresh start"}); err != nil {
		t.Errorf("the new database does not work: %v", err)
	}
	bad, _ := filepath.Glob(path + ".bad-*")
	if len(bad) != 1 {
		t.Fatalf("expected one .bad file, found %v", bad)
	}
	if kept, _ := os.ReadFile(bad[0]); string(kept) != string(garbage) {
		t.Error("the damaged file was not kept as it was")
	}
}

func TestNewerDatabaseIsRefusedAndLeftAlone(t *testing.T) {
	path := filepath.Join(t.TempDir(), "harper-pad.db")
	db, err := sql.Open("sqlite", filepath.ToSlash(path))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(fmt.Sprintf(`CREATE TABLE drafts (id TEXT); PRAGMA user_version = %d`, schemaVersion+1)); err != nil {
		t.Fatal(err)
	}
	db.Close()
	before, _ := os.ReadFile(path)
	if _, err := Open(path); !errors.Is(err, ErrNewer) {
		t.Fatalf("Open = %v, want ErrNewer", err)
	}
	after, _ := os.ReadFile(path)
	if string(before) != string(after) {
		t.Error("the newer database was modified")
	}
	if bad, _ := filepath.Glob(path + ".bad-*"); len(bad) != 0 {
		t.Errorf("the newer database was moved aside: %v", bad)
	}
}

func TestRowsFromAnEarlierShapeStillLoad(t *testing.T) {
	s, _ := open(t)
	// A blob without a format (as an earlier version might have written it) loads with the default.
	_, err := s.db.Exec(`INSERT INTO drafts (id, created_at, updated_at, data) VALUES (?, 1, 1, ?)`,
		strings.Repeat("a", 32), `{"content":"old row"}`)
	if err != nil {
		t.Fatal(err)
	}
	d, err := s.Get(strings.Repeat("a", 32))
	if err != nil || d.Format != FormatMarkdown || d.Content != "old row" {
		t.Errorf("Get = %+v, %v", d, err)
	}
	// A row whose text is damaged still lists, from its stored summary: the list never reads the text. Only Get notices.
	if _, err := s.db.Exec(`INSERT INTO drafts (id, created_at, updated_at, data, title) VALUES (?, 2, 2, 'not json', 'Kept title')`, strings.Repeat("b", 32)); err != nil {
		t.Fatal(err)
	}
	l, err := s.List(10, 0)
	if err != nil || len(l.Drafts) != 2 || l.Drafts[0].Title != "Kept title" {
		t.Errorf("List = %+v, %v", l, err)
	}
	if _, err := s.Get(strings.Repeat("b", 32)); err == nil {
		t.Error("Get of a damaged row succeeded")
	}
}

func TestRejectsPathsSQLiteCannotTake(t *testing.T) {
	if _, err := Open(filepath.Join(t.TempDir(), "a?b", "harper-pad.db")); err == nil {
		t.Error("a path with a question mark was accepted")
	}
}

func TestSetFilePathAndMigration(t *testing.T) {
	s, _ := open(t)
	d, err := s.Save(Draft{Content: "a"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.SetFile(d.ID, "/tmp/a.md", 42); err != nil {
		t.Fatal(err)
	}
	if got, _ := s.Get(d.ID); got.FilePath != "/tmp/a.md" || got.FileMTime != 42 {
		t.Errorf("Get path = %q, mtime %d", got.FilePath, got.FileMTime)
	}
	if l, _ := s.List(10, 0); l.Drafts[0].FilePath != "/tmp/a.md" {
		t.Errorf("List path = %q", l.Drafts[0].FilePath)
	}
	// Saving the text again keeps the link, whatever the caller sends.
	d.FilePath = "/elsewhere"
	d.Content = "b"
	if got, _ := s.Save(d); got.FilePath != "/tmp/a.md" {
		t.Errorf("Save changed the path to %q", got.FilePath)
	}
	if err := s.SetFile("00000000000000000000000000000000", "x", 1); !errors.Is(err, ErrNotFound) {
		t.Errorf("SetFile on a missing draft = %v", err)
	}

	// A version 1 database (no file_path column) is upgraded and keeps its drafts.
	path := filepath.Join(t.TempDir(), "old.db")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(`CREATE TABLE drafts (id TEXT PRIMARY KEY, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, data TEXT NOT NULL,
		format TEXT NOT NULL DEFAULT 'markdown', title TEXT NOT NULL DEFAULT '', excerpt TEXT NOT NULL DEFAULT '', tasks TEXT NOT NULL DEFAULT '[]',
		tasks_total INTEGER NOT NULL DEFAULT 0, tasks_done INTEGER NOT NULL DEFAULT 0) STRICT;
		CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT, WITHOUT ROWID;
		INSERT INTO drafts (id, created_at, updated_at, data) VALUES ('0123456789abcdef0123456789abcdef', 1, 2, '{"v":1,"format":"markdown","content":"old"}');
		PRAGMA user_version = 1`); err != nil {
		t.Fatal(err)
	}
	_ = db.Close()
	old, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = old.Close() }()
	if got, err := old.Get("0123456789abcdef0123456789abcdef"); err != nil || got.Content != "old" || got.FilePath != "" {
		t.Errorf("migrated draft = %+v, %v", got, err)
	}
}
