package store

import (
	"fmt"
	"runtime"
	"strings"
	"testing"
)

// Listing reads the summary columns, not the text, so its cost does not grow with the size of the drafts.
func TestListDoesNotReadTheText(t *testing.T) {
	s, _ := open(t)
	tick(s)
	big := "# Big draft\n- [x] one\n- [ ] two\n" + strings.Repeat("a long line of text that nobody lists. ", 25000) // about 1 MB, the largest a draft can be
	for i := range 20 {
		if _, err := s.Save(Draft{Content: fmt.Sprintf("%s\n%d", big, i), Title: "Big draft", TasksTotal: 2, TasksDone: 1}); err != nil {
			t.Fatal(err)
		}
	}
	var before, after runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&before)
	l, err := s.List(20, 0)
	runtime.ReadMemStats(&after)
	if err != nil || len(l.Drafts) != 20 || l.Drafts[0].Title != "Big draft" || l.Drafts[0].TasksTotal != 2 || l.Drafts[0].TasksDone != 1 {
		t.Fatalf("List = %+v, %v", l.Drafts[0], err)
	}
	// Reading 20 drafts of 1 MB would allocate well over 20 MB; the summaries are a few kilobytes.
	if grown := after.TotalAlloc - before.TotalAlloc; grown > 2<<20 {
		t.Errorf("listing 20 drafts of 1 MB allocated %d bytes; it must not read their text", grown)
	}
}

func TestProtectedSummaryMetadata(t *testing.T) {
	s, _ := open(t)
	for _, remote := range []bool{false, true} {
		d := Draft{
			ID: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", Content: ProtectedPrefix + `{"s":"salt","n":"nonce","c":"ciphertext"}`,
			CreatedAt: 1, UpdatedAt: 2, Title: "Private notes", Excerpt: "must not appear",
			Tasks: []Task{{Text: "must not appear"}}, TasksTotal: 1,
		}
		var err error
		if remote {
			_, err = s.ApplyRemote(d, 1)
		} else {
			_, err = s.Save(d)
		}
		if err != nil {
			t.Fatal(err)
		}
		list, err := s.List(1, 0)
		if err != nil {
			t.Fatal(err)
		}
		got := list.Drafts[0]
		if !got.Protected || got.Title != d.Title || got.Excerpt != "" || len(got.Tasks) != 0 || got.TasksTotal != 0 || got.TasksDone != 0 {
			t.Fatalf("remote=%v: summary = %+v", remote, got)
		}
	}
	plain, err := s.Save(Draft{Content: "# Title\nhp-protected", Excerpt: "hp-protected"})
	if err != nil {
		t.Fatal(err)
	}
	list, err := s.Search("hp-protected", 10)
	if err != nil || len(list.Drafts) != 1 || list.Drafts[0].ID != plain.ID || list.Drafts[0].Protected || list.Drafts[0].Excerpt != "hp-protected" {
		t.Fatalf("plain marker text: list = %+v, %v", list, err)
	}
}

func TestProtectedColumnAddedToOlderDatabase(t *testing.T) {
	s, path := open(t)
	plain, err := s.Save(Draft{Content: "Title\nbody", Title: "Title", Excerpt: "body"})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.db.Exec(`ALTER TABLE drafts DROP COLUMN protected`); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	if got, err := reopened.Get(plain.ID); err != nil || got.Content != plain.Content {
		t.Fatalf("migration changed the draft: %+v, %v", got, err)
	}
	if _, err := reopened.Save(Draft{Content: ProtectedPrefix + `{"s":"salt","n":"nonce","c":"ciphertext"}`, Title: "Private"}); err != nil {
		t.Fatal(err)
	}
	list, err := reopened.List(10, 0)
	if err != nil || len(list.Drafts) != 2 {
		t.Fatalf("list = %+v, %v", list, err)
	}
	for _, d := range list.Drafts {
		if d.Protected != (d.Title == "Private") {
			t.Errorf("protected flag wrong: %+v", d)
		}
	}
}
