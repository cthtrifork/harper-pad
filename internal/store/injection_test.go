package store

import (
	"strings"
	"testing"
)

// Text that tries to break out of a SQL string. Every one of these must be stored, found and returned as plain text,
// and the tables must come through untouched.
var injectionPayloads = []string{
	`'; DROP TABLE drafts; --`,
	`"; DROP TABLE settings; --`,
	`' OR '1'='1`,
	`" OR 1=1 --`,
	`%' OR '1'='1' --`,
	`\'; DELETE FROM drafts; --`,
	`x'); INSERT INTO drafts VALUES ('evil', 0, 0, '{}'); --`,
	"line one\n'; UPDATE drafts SET data = '{}'; --",
	`1; PRAGMA writable_schema = 1; --`,
	`' UNION SELECT key, value, 0, 0 FROM settings --`,
}

func TestSQLInjectionInContentAndSearch(t *testing.T) {
	s, _ := open(t)
	tick(s)
	if _, err := s.Save(Draft{Content: "an innocent draft"}); err != nil {
		t.Fatal(err)
	}
	for _, p := range injectionPayloads {
		d, err := s.Save(Draft{Content: p})
		if err != nil {
			t.Fatalf("saving %q: %v", p, err)
		}
		if got, err := s.Get(d.ID); err != nil || got.Content != p {
			t.Errorf("payload %q came back as %q (%v)", p, got.Content, err)
		}
		// Searching for the payload finds exactly that draft: it is matched as text, not run.
		l, err := s.Search(p, 50)
		if err != nil {
			t.Fatalf("searching %q: %v", p, err)
		}
		found := false
		for _, x := range l.Drafts {
			if x.ID == d.ID {
				found = true
			}
		}
		if !found {
			t.Errorf("searching for %q did not find the draft that holds it", p)
		}
		// And it does not behave like a wildcard that matches everything.
		if l.Total == len(injectionPayloads)+1 {
			t.Errorf("searching for %q matched every draft", p)
		}
	}
	all, err := s.List(500, 0)
	if err != nil || all.Total != len(injectionPayloads)+1 {
		t.Errorf("%d drafts after the payloads, want %d (%v)", all.Total, len(injectionPayloads)+1, err)
	}
}

func TestSQLInjectionThroughIDs(t *testing.T) {
	s, _ := open(t)
	keep, _ := s.Save(Draft{Content: "must survive"})
	for _, id := range injectionPayloads {
		if _, err := s.Get(id); err == nil {
			t.Errorf("Get(%q) found something", id)
		}
		if err := s.Delete(id); err != nil {
			t.Errorf("Delete(%q): %v", id, err)
		}
		if _, err := s.Save(Draft{ID: id, Content: "x"}); err == nil {
			t.Errorf("Save accepted %q as an id", id)
		}
	}
	if got, err := s.Get(keep.ID); err != nil || got.Content != "must survive" {
		t.Errorf("the draft did not survive the injection attempts: %+v, %v", got, err)
	}
}

func TestSQLInjectionInSettings(t *testing.T) {
	s, _ := open(t)
	for _, p := range injectionPayloads {
		if err := s.SetSettings(map[string]string{p: p}); err != nil {
			t.Fatalf("SetSettings(%q): %v", p, err)
		}
	}
	got, err := s.Settings()
	if err != nil || len(got) != len(injectionPayloads) {
		t.Fatalf("%d settings, want %d (%v)", len(got), len(injectionPayloads), err)
	}
	for _, p := range injectionPayloads {
		if got[p] != p {
			t.Errorf("setting %q came back as %q", p, got[p])
		}
	}
	// The schema is still what it was: two tables, and the drafts table still takes drafts.
	var tables string
	rows, _ := s.db.Query(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
	defer rows.Close()
	var names []string
	for rows.Next() {
		var n string
		_ = rows.Scan(&n)
		names = append(names, n)
	}
	tables = strings.Join(names, ",")
	if tables != "drafts,settings" {
		t.Errorf("tables are now %s", tables)
	}
	if _, err := s.Save(Draft{Content: "still works"}); err != nil {
		t.Errorf("saving after the payloads: %v", err)
	}
}
