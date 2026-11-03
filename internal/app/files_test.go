package app

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/internal/store"
)

func TestSaveDraftToFile(t *testing.T) {
	s := newTestService(t)
	dir := t.TempDir()
	target := filepath.Join(dir, "plan.md")
	picks := 0
	var suggested string
	s.pickPath = func(name, _ string) (string, error) { picks++; suggested = name; return target, nil }

	// First save: the dialog opens, the file is written, and the draft stays in the database with a link to the file.
	r, err := s.SaveDraftToFile(store.Draft{Content: "# Plan: Q4!\nfirst"}, false, false)
	if err != nil || r.Cancelled {
		t.Fatalf("first save = %+v, %v", r, err)
	}
	if suggested != "Plan Q4.md" {
		t.Errorf("suggested name = %q", suggested)
	}
	if got, _ := os.ReadFile(target); string(got) != "# Plan: Q4!\nfirst" {
		t.Errorf("file = %q", got)
	}
	if got, err := s.GetDraft(r.Draft.ID); err != nil || got.FilePath != target || got.Content != "# Plan: Q4!\nfirst" {
		t.Errorf("draft = %+v, %v", got, err)
	}

	// Second save: no dialog, the same file is overwritten.
	d := r.Draft
	d.Content = "second"
	if _, err := s.SaveDraftToFile(d, false, false); err != nil || picks != 1 {
		t.Fatalf("second save: err %v, dialogs %d", err, picks)
	}
	if got, _ := os.ReadFile(target); string(got) != "second" {
		t.Errorf("file = %q", got)
	}

	// The page cannot point the draft at another file: the path it sends is ignored.
	d.FilePath = filepath.Join(dir, "elsewhere.md")
	d.Content = "third"
	if _, err := s.SaveDraftToFile(d, false, false); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(d.FilePath); err == nil {
		t.Error("wrote to a path taken from the page")
	}
	if got, _ := os.ReadFile(target); string(got) != "third" {
		t.Errorf("file = %q", got)
	}

	// Save as: the dialog opens again and the draft moves to the new file; the old file stays.
	other := filepath.Join(dir, "copy.md")
	s.pickPath = func(string, string) (string, error) { return other, nil }
	r, err = s.SaveDraftToFile(d, true, false)
	if err != nil || r.Draft.FilePath != other {
		t.Fatalf("save as = %+v, %v", r, err)
	}
	if got, _ := s.GetDraft(d.ID); got.FilePath != other {
		t.Errorf("stored path = %q", got.FilePath)
	}

	// Cancelling the dialog writes nothing and changes nothing.
	s.pickPath = func(string, string) (string, error) { return "", nil }
	d.Content = "fourth"
	if r, err := s.SaveDraftToFile(d, true, false); err != nil || !r.Cancelled {
		t.Fatalf("cancel = %+v, %v", r, err)
	}
	if got, _ := os.ReadFile(other); string(got) != "third" {
		t.Errorf("file after cancel = %q", got)
	}
}

func TestSaveDraftDoesNotChangeTheFile(t *testing.T) {
	s := newTestService(t)
	target := filepath.Join(t.TempDir(), "a.md")
	s.pickPath = func(string, string) (string, error) { return target, nil }
	r, err := s.SaveDraftToFile(store.Draft{Content: "x"}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	d := r.Draft
	d.Content, d.FilePath = "y", "/etc/passwd"
	if got, err := s.SaveDraft(d); err != nil || got.FilePath != target {
		t.Errorf("SaveDraft changed the link: %+v, %v", got, err)
	}
}

func TestSaveDraftToFileRejectsRelativePath(t *testing.T) {
	s := newTestService(t)
	s.pickPath = func(string, string) (string, error) { return "notes.md", nil }
	if _, err := s.SaveDraftToFile(store.Draft{Content: "x"}, false, false); err == nil {
		t.Error("a relative path was accepted")
	}
}

func TestSuggestName(t *testing.T) {
	for _, c := range []struct{ title, format, want string }{
		{"Shopping list", "markdown", "Shopping list.md"},
		{"a/b\\c:d", "text", "abcd.txt"},
		{"???", "markdown", "Untitled.md"},
	} {
		if got := suggestName(c.title, c.format); got != c.want {
			t.Errorf("suggestName(%q, %q) = %q, want %q", c.title, c.format, got, c.want)
		}
	}
}

func TestSaveDraftToFileNoticesOutsideChanges(t *testing.T) {
	s := newTestService(t)
	target := filepath.Join(t.TempDir(), "a.md")
	var offered string
	s.pickPath = func(name, _ string) (string, error) { offered = name; return target, nil }
	r, err := s.SaveDraftToFile(store.Draft{Content: "mine"}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	d := r.Draft
	d.Content = "mine, edited"

	// Another program changes the file: the save writes nothing, but the draft is still saved.
	if err := os.WriteFile(target, []byte("theirs"), 0o644); err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(target, later, later); err != nil {
		t.Fatal(err)
	}
	r, err = s.SaveDraftToFile(d, false, false)
	if err != nil || !r.Conflict {
		t.Fatalf("expected a conflict, got %+v, %v", r, err)
	}
	if got, _ := os.ReadFile(target); string(got) != "theirs" {
		t.Errorf("file was overwritten: %q", got)
	}
	if got, _ := s.GetDraft(d.ID); got.Content != "mine, edited" || got.FilePath != target {
		t.Errorf("draft = %+v", got)
	}

	// Saving again with overwrite replaces it, and the next plain save is fine.
	if r, err = s.SaveDraftToFile(d, false, true); err != nil || r.Conflict {
		t.Fatalf("overwrite = %+v, %v", r, err)
	}
	if got, _ := os.ReadFile(target); string(got) != "mine, edited" {
		t.Errorf("file = %q", got)
	}
	if r, err = s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save after overwrite = %+v, %v", r, err)
	}

	// A file that was deleted is written again without fuss.
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	if r, err = s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save of a deleted file = %+v, %v", r, err)
	}

	// Save as offers the file's own name.
	_, _ = s.SaveDraftToFile(d, true, false)
	if offered != "a.md" {
		t.Errorf("save as offered %q", offered)
	}
}

func TestWriteFileKeepsSymlink(t *testing.T) {
	dir := t.TempDir()
	real, link := filepath.Join(dir, "real.md"), filepath.Join(dir, "link.md")
	if err := os.WriteFile(real, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(real, link); err != nil {
		t.Skip("no symlinks here")
	}
	if err := writeFileAtomic(link, []byte("new")); err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Lstat(link); err != nil || fi.Mode()&os.ModeSymlink == 0 {
		t.Errorf("the link was replaced: %v, %v", fi, err)
	}
	if got, _ := os.ReadFile(real); string(got) != "new" {
		t.Errorf("target = %q", got)
	}
	if fi, _ := os.Stat(real); runtime.GOOS != "windows" && fi.Mode().Perm() != 0o600 { // Windows has no Unix modes
		t.Errorf("mode = %v", fi.Mode().Perm())
	}
}
