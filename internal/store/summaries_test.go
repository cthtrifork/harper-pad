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
