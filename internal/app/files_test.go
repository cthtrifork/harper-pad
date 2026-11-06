package app

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/internal/store"
)

func TestSaveDraftToFile(t *testing.T) {
	s := newTestServices(t).Drafts
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
	s := newTestServices(t).Drafts
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
	s := newTestServices(t).Drafts
	s.pickPath = func(string, string) (string, error) { return "notes.md", nil }
	if _, err := s.SaveDraftToFile(store.Draft{Content: "x"}, false, false); err == nil {
		t.Error("a relative path was accepted")
	}
}

func TestSuggestName(t *testing.T) {
	// The web build's fileName (frontend/src/lib/webFiles.js) runs the same cases.
	raw, err := os.ReadFile("testdata/filename.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct{ Name, Title, Format, Want string }
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	if len(cases) == 0 {
		t.Fatal("no fixtures")
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			if got := suggestName(c.Title, c.Format); got != c.Want {
				t.Errorf("suggestName(%q, %q) = %q, want %q", c.Title, c.Format, got, c.Want)
			}
		})
	}
}

func TestSaveDraftToFileNoticesOutsideChanges(t *testing.T) {
	s := newTestServices(t).Drafts
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

// linked saves a draft to a new file in a temporary folder and returns the service, the draft id and the path.
func linked(t *testing.T, content string) (*DraftService, string, string) {
	t.Helper()
	s := newTestServices(t).Drafts
	target := filepath.Join(t.TempDir(), "a.md")
	s.pickPath = func(string, string) (string, error) { return target, nil }
	r, err := s.SaveDraftToFile(store.Draft{Content: content}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	return s, r.Draft.ID, target
}

// reloadAsPage does what the page does to take the file's text into the draft: read it, update the draft through the normal path, then record
// the file as the baseline.
func reloadAsPage(s *DraftService, id string) (store.Draft, error) {
	ft, err := s.LinkedFileText(id)
	if err != nil {
		return store.Draft{}, err
	}
	d, err := s.GetDraft(id)
	if err != nil {
		return store.Draft{}, err
	}
	d.Content = ft.Text
	saved, err := s.SaveDraft(d)
	if err != nil {
		return store.Draft{}, err
	}
	if err := s.RecordLinkedFile(id, ft.Stamp); err != nil {
		return store.Draft{}, err
	}
	saved.FilePath = d.FilePath
	return saved, nil
}

// outside replaces the file's text as another program would, with a modification time an hour on.
func outside(t *testing.T, path, text string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(text), 0o644); err != nil {
		t.Fatal(err)
	}
	later := time.Now().Add(time.Hour)
	if err := os.Chtimes(path, later, later); err != nil {
		t.Fatal(err)
	}
}

func state(t *testing.T, s *DraftService, id string) FileCheck {
	t.Helper()
	c, err := s.LinkedFileStatus(id)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestLinkedFileStatusScenarios(t *testing.T) {
	s, id, target := linked(t, "one\ntwo\nthree\n")

	plain, err := s.SaveDraft(store.Draft{Content: "plain"})
	if err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, plain.ID); c.State != FileNone {
		t.Errorf("unlinked draft = %+v", c)
	}
	if c := state(t, s, id); c.State != FileSame {
		t.Errorf("our own write = %+v", c)
	}

	// Touched, same text (a sync client, `touch`): quietly the new baseline, also when the file uses CRLF.
	outside(t, target, "one\r\ntwo\r\nthree\r\n")
	if c := state(t, s, id); c.State != FileSame {
		t.Errorf("touched file = %+v", c)
	}
	if st, _ := s.db.open(); st != nil {
		if d, _ := st.Get(id); d.FileMTime == 0 {
			t.Error("baseline lost")
		}
	}

	// Changed text.
	outside(t, target, "one\nTWO\nthree\nfour\n")
	c := state(t, s, id)
	if c.State != FileChanged || c.Stamp == "" {
		t.Errorf("changed file = %+v", c)
	}
	// It stays changed until the person decides: asking again does not re-baseline.
	if c := state(t, s, id); c.State != FileChanged {
		t.Errorf("second look = %+v", c)
	}

	// Cannot be read as text now.
	outside(t, target, string([]byte{0xff, 0xfe, 0x00}))
	if c := state(t, s, id); c.State != FileBroken || !strings.Contains(c.Reason, "not text") {
		t.Errorf("binary file = %+v", c)
	}
	outside(t, target, strings.Repeat("x", store.MaxContentBytes+1))
	if c := state(t, s, id); c.State != FileBroken || !strings.Contains(c.Reason, "larger") {
		t.Errorf("large file = %+v", c)
	}

	// A folder where the file was.
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); c.State != FileMissing {
		t.Errorf("deleted file = %+v", c)
	}
	if err := os.Mkdir(target, 0o755); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); c.State != FileBroken || !strings.Contains(c.Reason, "folder") {
		t.Errorf("a folder = %+v", c)
	}
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}

	// The whole folder gone.
	if err := os.Remove(filepath.Dir(target)); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); c.State != FileMissing {
		t.Errorf("folder gone = %+v", c)
	}
	if _, err := s.LinkedFileStatus("0123456789abcdef0123456789abcdef"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown id error = %v", err)
	}
}

func TestSaveWithTouchedFileIsNoConflict(t *testing.T) {
	s, id, target := linked(t, "one")
	// Only the mtime moved, the text is what we wrote: an edit saves without a warning.
	outside(t, target, "one")
	d, _ := s.GetDraft(id)
	d.Content = "one edited"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save = %+v, %v", r, err)
	}
	// The file already holds the text being saved: also fine.
	outside(t, target, "one more")
	d.Content = "one more"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save = %+v, %v", r, err)
	}
}

func TestSaveRefusesToOverwriteWhatIsNotText(t *testing.T) {
	big := strings.Repeat("x", 2*store.MaxContentBytes+1) // a write reads up to twice the draft limit, so a CRLF file made from a full draft is read whole
	for name, content := range map[string]string{"binary": "\x00\x01\x02 PNG", "not utf-8": "\xff\xfe\xfd", "too large": big} {
		t.Run(name, func(t *testing.T) {
			s, id, target := linked(t, "one")
			outside(t, target, content)
			if c := state(t, s, id); c.State != FileBroken || c.Reason == "" {
				t.Fatalf("status = %+v", c)
			}
			d, _ := s.GetDraft(id)
			d.Content = "one edited"
			// Neither a plain save nor Overwrite replaces it; the draft itself is saved.
			for _, overwrite := range []bool{false, true} {
				if _, err := s.SaveDraftToFile(d, false, overwrite); err == nil || !strings.Contains(err.Error(), "not overwritten") {
					t.Fatalf("overwrite=%v: save = %v", overwrite, err)
				}
			}
			if got, _ := os.ReadFile(target); string(got) != content {
				t.Errorf("file was replaced: %d bytes", len(got))
			}
			if got, _ := s.GetDraft(id); got.Content != "one edited" {
				t.Errorf("draft = %q", got.Content)
			}
			// Text again: the status clears (it is a changed file) and a save works.
			outside(t, target, "back to text")
			if c := state(t, s, id); c.State != FileChanged {
				t.Errorf("after restoring text = %+v", c)
			}
			if r, err := s.SaveDraftToFile(d, false, true); err != nil || r.Conflict {
				t.Errorf("overwrite of text = %+v, %v", r, err)
			}
		})
	}
}

func TestUnlinkDraftFile(t *testing.T) {
	s, id, target := linked(t, "keep both")
	d, err := s.UnlinkDraftFile(id)
	if err != nil || d.FilePath != "" || d.Content != "keep both" {
		t.Fatalf("unlink = %+v, %v", d, err)
	}
	if got, _ := os.ReadFile(target); string(got) != "keep both" {
		t.Errorf("the file was touched: %q", got)
	}
	if c := state(t, s, id); c.State != FileNone {
		t.Errorf("after unlink = %+v", c)
	}
}

func TestUndoUnlinkRestoresTheSameLinkAndBaseline(t *testing.T) {
	s, id, target := linked(t, "keep\n")
	before, _ := s.db.open()
	b, _ := before.Get(id)
	if _, err := s.UnlinkDraftFile(id); err != nil {
		t.Fatal(err)
	}
	d, err := s.UndoUnlinkDraftFile(id)
	if err != nil || d.FilePath != target || d.Content != "keep\n" {
		t.Fatalf("undo = %+v, %v", d, err)
	}
	st, _ := s.db.open()
	a, _ := st.Get(id)
	if a.FileMTime != b.FileMTime || a.FileHash != b.FileHash || a.FileMTime == 0 {
		t.Errorf("baseline changed: before %+v, after %+v", b, a)
	}
	// With the baseline back, an untouched file is still "same" and a save writes without a conflict.
	if c := state(t, s, id); c.State != FileSame {
		t.Errorf("status after undo = %+v", c)
	}
	// Nothing to undo twice, or for a draft that was never unlinked, or after it was linked again.
	if _, err := s.UndoUnlinkDraftFile(id); err == nil {
		t.Error("undid twice")
	}
	plain, _ := s.SaveDraft(store.Draft{Content: "plain"})
	if _, err := s.UndoUnlinkDraftFile(plain.ID); err == nil {
		t.Error("undid an unlink that never happened")
	}
	if _, err := s.UnlinkDraftFile(id); err != nil {
		t.Fatal(err)
	}
	other, err := s.SaveDraftToFile(store.Draft{Content: "other"}, false, false) // another draft takes the path through Save as file
	if err != nil {
		t.Fatal(err)
	}
	if _, err := s.UndoUnlinkDraftFile(id); err != nil {
		t.Fatalf("undo after another draft took the path: %v", err)
	}
	if g, _ := s.GetDraft(other.Draft.ID); g.FilePath != "" {
		t.Errorf("two holders of one file: %+v", g)
	}
}

func TestTakingTheFilesTextIntoTheDraft(t *testing.T) {
	s, id, target := linked(t, "mine")
	outside(t, target, "theirs")
	d, err := reloadAsPage(s, id)
	if err != nil || d.Content != "theirs" || d.FilePath != target {
		t.Fatalf("reload = %+v, %v", d, err)
	}
	if c := state(t, s, id); c.State != FileSame {
		t.Errorf("after reload = %+v", c)
	}
	if err := os.WriteFile(target, []byte{0xff, 0xfe, 'x'}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := reloadAsPage(s, id); err == nil {
		t.Error("reloaded a file that is not UTF-8")
	}
	if got, _ := s.GetDraft(id); got.Content != "theirs" {
		t.Errorf("draft changed by a refused reload: %q", got.Content)
	}
	if err := os.Remove(target); err != nil {
		t.Fatal(err)
	}
	if _, err := reloadAsPage(s, id); err == nil {
		t.Error("reloaded a file that is gone")
	}
	plain, _ := s.SaveDraft(store.Draft{Content: "plain"})
	if _, err := reloadAsPage(s, plain.ID); err == nil {
		t.Error("reloaded a draft that has no file")
	}
}

func TestAtomicWriteFailureLeavesTheFileWhole(t *testing.T) {
	if runtime.GOOS == "windows" || os.Getuid() == 0 {
		t.Skip("needs a read-only folder that root and Windows ignore")
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "a.md")
	if err := os.WriteFile(path, []byte("old"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(dir, 0o555); err != nil { // no temporary file can be made beside it
		t.Fatal(err)
	}
	defer func() { _ = os.Chmod(dir, 0o755) }()
	err := writeFileAtomic(path, []byte("new"))
	if err == nil || !strings.Contains(err.Error(), "permission denied") {
		t.Fatalf("write = %v, want permission denied", err)
	}
	if got, _ := os.ReadFile(path); string(got) != "old" {
		t.Errorf("file = %q: a failed write must leave it whole", got)
	}
	left, _ := os.ReadDir(dir)
	if len(left) != 1 {
		t.Errorf("a temporary file was left behind: %v", left)
	}
}

func TestReloadNormalizesAndOverwriteKeepsCRLF(t *testing.T) {
	s := newTestServices(t).Drafts
	target := filepath.Join(t.TempDir(), "a.md")
	s.pickPath = func(string, string) (string, error) { return target, nil }
	r, err := s.SaveDraftToFile(store.Draft{Content: "mine"}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	id := r.Draft.ID
	if err := os.WriteFile(target, []byte("one\r\ntwo\rthree\r\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	d, err := reloadAsPage(s, id)
	if err != nil || d.Content != "one\ntwo\nthree\n" {
		t.Fatalf("reload = %q, %v", d.Content, err)
	}
	// A save of edited text replaces a CRLF file with CRLF line endings.
	d.Content = "one\nedited\n"
	if _, err := s.SaveDraftToFile(d, false, true); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(target); string(got) != "one\r\nedited\r\n" {
		t.Errorf("file = %q", got)
	}
	// A file that used LF stays LF.
	if err := os.WriteFile(target, []byte("a\nb\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.SaveDraftToFile(d, false, true); err != nil {
		t.Fatal(err)
	}
	if got, _ := os.ReadFile(target); string(got) != "one\nedited\n" {
		t.Errorf("file = %q", got)
	}
}

func TestChangedFileIsCleanOnlyWithoutEditsOfItsOwn(t *testing.T) {
	s, id, target := linked(t, "one\ntwo\n")

	// Written by us, then the file changes: the draft has no edits of its own since, so the file may replace it.
	outside(t, target, "one\nTWO\n")
	if c := state(t, s, id); c.State != FileChanged || !c.Clean {
		t.Fatalf("clean draft = %+v", c)
	}

	// An edit of the draft (autosave) makes it a real conflict.
	d, _ := s.GetDraft(id)
	d.Content = "one\ntwo\nmine\n"
	if _, err := s.SaveDraft(d); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); c.State != FileChanged || c.Clean {
		t.Fatalf("edited draft = %+v", c)
	}

	// Typing and undoing back to the same text is no edit: the hash matches again. CRLF in the file does not matter.
	d.Content = "one\ntwo\n"
	if _, err := s.SaveDraft(d); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); !c.Clean {
		t.Fatalf("restored draft = %+v", c)
	}

	// After a reload the baseline is the file; a later outside change is clean again.
	if _, err := reloadAsPage(s, id); err != nil {
		t.Fatal(err)
	}
	outside(t, target, "three\r\n")
	if c := state(t, s, id); c.State != FileChanged || !c.Clean {
		t.Fatalf("after reload = %+v", c)
	}

	// A draft linked before the hash existed (no hash) is never clean.
	st, _ := s.db.open()
	if err := st.SetFile(id, target, 5); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); c.Clean {
		t.Fatalf("unknown baseline = %+v", c)
	}
}

func TestUnreachableFileIsBrokenNotAConflict(t *testing.T) {
	if runtime.GOOS == "windows" || os.Getuid() == 0 {
		t.Skip("needs a file that its owner cannot read")
	}
	s, id, target := linked(t, "mine")
	outside(t, target, "theirs")
	if err := os.Chmod(target, 0o000); err != nil {
		t.Fatal(err)
	}
	if c := state(t, s, id); c.State != FileBroken || !strings.Contains(c.Reason, "permission") {
		t.Errorf("unreadable file = %+v", c)
	}
	// A save does not raise a conflict for a file it cannot read: it writes (replacing the file by rename) and the file is readable again.
	d, _ := s.GetDraft(id)
	d.Content = "mine again"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save = %+v, %v", r, err)
	}
	if c := state(t, s, id); c.State != FileSame {
		t.Errorf("after the save = %+v", c)
	}
}

func TestUndoneReloadIsMyVersionWinsWhileTheFileIsTheReloadedOne(t *testing.T) {
	s, id, target := linked(t, "old\n")
	outside(t, target, "theirs\n")
	if _, err := reloadAsPage(s, id); err != nil {
		t.Fatal(err)
	}
	// Ctrl+Z brings the old text back (the autosave stores it). The file is still the version that was reloaded, so the save just writes.
	d, _ := s.GetDraft(id)
	d.Content = "old\n"
	if _, err := s.SaveDraft(d); err != nil {
		t.Fatal(err)
	}
	d.Content = "old, edited\n"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save after an undone reload = %+v, %v", r, err)
	}
	if got, _ := os.ReadFile(target); string(got) != "old, edited\n" {
		t.Errorf("file = %q", got)
	}
}

func TestUndoneReloadThenFileChangedAgainIsAConflict(t *testing.T) {
	s, id, target := linked(t, "old\n")
	outside(t, target, "theirs\n")
	if _, err := reloadAsPage(s, id); err != nil {
		t.Fatal(err)
	}
	d, _ := s.GetDraft(id)
	d.Content = "old\n"
	if _, err := s.SaveDraft(d); err != nil {
		t.Fatal(err)
	}
	// Changed again after the reload, with a later mtime and also with the mtime kept: both are real conflicts.
	fi, _ := os.Stat(target)
	if err := os.WriteFile(target, []byte("theirs again, longer\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	later := fi.ModTime().Add(time.Minute)
	if err := os.Chtimes(target, later, later); err != nil {
		t.Fatal(err)
	}
	d.Content = "old, edited\n"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || !r.Conflict {
		t.Fatalf("later mtime = %+v, %v", r, err)
	}
	if err := os.WriteFile(target, []byte("THEIRS\n"), 0o644); err != nil { // same length as the reloaded text
		t.Fatal(err)
	}
	if err := os.Chtimes(target, fi.ModTime(), fi.ModTime()); err != nil {
		t.Fatal(err)
	}
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || !r.Conflict {
		t.Fatalf("same mtime and size = %+v, %v", r, err)
	}
	if got, _ := os.ReadFile(target); string(got) != "THEIRS\n" {
		t.Errorf("file was replaced: %q", got)
	}
}

func TestChangedContentWithTheMtimeKeptIsNotOverwrittenSilently(t *testing.T) {
	s, id, target := linked(t, "one\n")
	fi, _ := os.Stat(target)
	d, _ := s.GetDraft(id)
	d.Content = "one, edited\n"
	for name, content := range map[string]string{"same size": "ONE\n", "other size": "something quite different\n"} {
		if err := os.WriteFile(target, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(target, fi.ModTime(), fi.ModTime()); err != nil { // rsync -t
			t.Fatal(err)
		}
		if r, err := s.SaveDraftToFile(d, false, false); err != nil || !r.Conflict {
			t.Fatalf("%s: save = %+v, %v", name, r, err)
		}
		if got, _ := os.ReadFile(target); string(got) != content {
			t.Errorf("%s: file was replaced: %q", name, got)
		}
	}
	// Overwrite is the explicit choice.
	if r, err := s.SaveDraftToFile(d, false, true); err != nil || r.Conflict {
		t.Fatalf("overwrite = %+v, %v", r, err)
	}
	// Untouched file: an ordinary save writes.
	d.Content = "one, edited again\n"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("plain save = %+v, %v", r, err)
	}
}

func TestSaveAsOntoAnotherDraftsFileMovesTheLink(t *testing.T) {
	s := newTestServices(t).Drafts
	target := filepath.Join(t.TempDir(), "shared.md")
	s.pickPath = func(string, string) (string, error) { return target, nil }
	first, err := s.SaveDraftToFile(store.Draft{Content: "# First\nbody"}, false, false)
	if err != nil || len(first.UnlinkedFrom) != 0 {
		t.Fatalf("first = %+v, %v", first, err)
	}
	second, err := s.SaveDraftToFile(store.Draft{Content: "# Second\nbody"}, false, false)
	if err != nil {
		t.Fatal(err)
	}
	if len(second.UnlinkedFrom) != 1 || second.UnlinkedFrom[0] != "First" {
		t.Errorf("unlinked = %v", second.UnlinkedFrom)
	}
	if got, _ := s.GetDraft(first.Draft.ID); got.FilePath != "" || got.Content != "# First\nbody" {
		t.Errorf("the old holder = %+v", got)
	}
	if got, _ := s.GetDraft(second.Draft.ID); got.FilePath != target {
		t.Errorf("the new holder = %+v", got)
	}
	if b, _ := os.ReadFile(target); string(b) != "# Second\nbody" {
		t.Errorf("file = %q", b)
	}
}

func TestLinkedFileText(t *testing.T) {
	s, id, target := linked(t, "mine")
	outside(t, target, "a\r\nb\r\n")
	got, err := s.LinkedFileText(id)
	if err != nil || got.Text != "a\nb\n" || got.Stamp == "" {
		t.Fatalf("text = %+v, %v", got, err)
	}
	if c := state(t, s, id); c.Stamp != got.Stamp {
		t.Errorf("stamps differ: %q and %q", c.Stamp, got.Stamp)
	}
	if err := os.WriteFile(target, []byte{0xff, 0x00}, 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := s.LinkedFileText(id); err == nil {
		t.Error("read a binary file as text")
	}
	plain, _ := s.SaveDraft(store.Draft{Content: "plain"})
	if _, err := s.LinkedFileText(plain.ID); err == nil {
		t.Error("read the file of a draft that has none")
	}
}

func TestAFullDraftWrittenWithCRLFIsReadWholeAndWrittenAgain(t *testing.T) {
	line := strings.Repeat("x", 62) + "\n" // 63 bytes; as CRLF 64
	full := strings.Repeat(line, store.MaxContentBytes/len(line))
	s, id, target := linked(t, "start")
	if err := os.WriteFile(target, []byte(strings.ReplaceAll(full, "\n", "\r\n")), 0o644); err != nil { // longer than 1 MiB on disk
		t.Fatal(err)
	}
	st, _ := s.db.open()
	if err := st.SetFile(id, target, 1); err != nil {
		t.Fatal(err)
	}
	if err := st.SetFileHash(id, full); err != nil { // the baseline is that text
		t.Fatal(err)
	}
	d, _ := s.GetDraft(id)
	d.Content = full[:len(full)-len(line)] + "edited\n"
	if len(d.Content) > store.MaxContentBytes {
		t.Fatal("the draft is over the limit")
	}
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict {
		t.Fatalf("save = %+v, %v", r, err)
	}
}

func TestALinkWithoutAHashComparesByText(t *testing.T) {
	s, id, target := linked(t, "one\n")
	st, _ := s.db.open()
	if err := st.SetFile(id, target, 1); err != nil { // clears the hash
		t.Fatal(err)
	}
	d, _ := s.GetDraft(id)
	d.Content = "one edited\n"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || r.Conflict { // the file holds the draft as stored: unchanged
		t.Fatalf("save = %+v, %v", r, err)
	}
	if err := st.SetFile(id, target, 1); err != nil {
		t.Fatal(err)
	}
	outside(t, target, "something else\n")
	d.Content = "two\n"
	if r, err := s.SaveDraftToFile(d, false, false); err != nil || !r.Conflict { // any other text asks
		t.Fatalf("save = %+v, %v", r, err)
	}
}

func TestAFileChangedBackToTheBaselineTextIsNotAConflict(t *testing.T) {
	s, id, target := linked(t, "base\n")
	d, _ := s.GetDraft(id)
	d.Content = "base, edited\n"
	if _, err := s.SaveDraft(d); err != nil {
		t.Fatal(err)
	}
	outside(t, target, "other\n")
	outside(t, target, "base\r\n") // back to the text this app left, with a later time
	if c := state(t, s, id); c.State != FileSame {
		t.Errorf("status = %+v", c)
	}
}
