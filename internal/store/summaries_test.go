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
	big := "# Big draft\n- [x] one\n- [ ] two\n" + strings.Repeat("a long line of text that nobody lists. ", 50000) // about 2 MB
	for i := range 20 {
		if _, err := s.Save(Draft{Content: fmt.Sprintf("%s\n%d", big, i)}); err != nil {
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
	// Reading 20 drafts of 2 MB would allocate well over 40 MB; the summaries are a few kilobytes.
	if grown := after.TotalAlloc - before.TotalAlloc; grown > 2<<20 {
		t.Errorf("listing 20 drafts of 2 MB allocated %d bytes; it must not read their text", grown)
	}
}

// The stored summary follows the text: it is rewritten on every save.
func TestSummaryFollowsTheText(t *testing.T) {
	s, _ := open(t)
	tick(s)
	d, _ := s.Save(Draft{Content: "First title\n- [ ] a"})
	d.Content = "# Second title\n- [x] a\n- [x] b\nSome more words"
	d.Format = FormatText
	if _, err := s.Save(d); err != nil {
		t.Fatal(err)
	}
	l, _ := s.List(10, 0)
	got := l.Drafts[0]
	if got.Title != "Second title" || got.Format != FormatText || got.TasksTotal != 2 || got.TasksDone != 2 || got.Excerpt != "Some more words" {
		t.Errorf("summary after the second save: %+v", got)
	}
}
