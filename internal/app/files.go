package app

import (
	"bytes"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"unicode/utf8"

	"github.com/cthtrifork/harper-pad/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// FileSave is the answer to SaveDraftToFile.
type FileSave struct {
	// Draft is the draft as stored, with FilePath set to the file it was written to.
	Draft store.Draft `json:"draft"`
	// Cancelled is true when the user closed the save dialog; nothing was written and Draft is the draft as it was.
	Cancelled bool `json:"cancelled"`
	// Conflict is true when the file was changed by something else since it was last written here. Nothing was written; the draft
	// itself was saved. Saving again with overwrite replaces the file.
	Conflict bool `json:"conflict"`
	// UnlinkedFrom holds the titles of other drafts that were linked to this file and are not any more: a file has one holder, the draft saved
	// to it last.
	UnlinkedFrom []string `json:"unlinkedFrom"`
}

var unsafeName = regexp.MustCompile(`[^\p{L}\p{N}._ -]+`)

// suggestName is the file name offered in the save dialog: the draft's title, with the extension of its format.
func suggestName(title, format string) string {
	name := strings.Trim(unsafeName.ReplaceAllString(title, ""), " .-")
	if name == "" {
		name = "Untitled"
	}
	if r := []rune(name); len(r) > 60 {
		name = strings.TrimSpace(string(r[:60]))
	}
	if format == store.FormatText {
		return name + ".txt"
	}
	return name + ".md"
}

// pickSavePath asks the user where to save. It returns "" when they cancel. It is a field of the service so tests can replace it.
func pickSavePath(suggested, dir string) (string, error) {
	if demo := demoSaveDir(); demo != "" { // the headless demo has no dialog: save to its folder under the suggested name
		if err := os.MkdirAll(demo, 0o755); err != nil {
			return "", err
		}
		return filepath.Join(demo, suggested), nil
	}
	app := application.Get()
	if app == nil {
		return "", errors.New("saving to a file needs the desktop app")
	}
	// The GTK4 chooser takes its title from Title (Message is not shown there) and is only modal over a window it is attached to.
	d := app.Dialog.SaveFileWithOptions(&application.SaveFileDialogOptions{
		Title:                "Save draft as a file",
		Filename:             suggested,
		Directory:            dir,
		CanCreateDirectories: true,
		Window:               app.Window.Current(),
	}).AddFilter("Markdown", "*.md").AddFilter("Text", "*.txt").AddFilter("All files", "*")
	return d.PromptForSingleSelection()
}

// SaveDraftToFile saves the draft's text to a file as well as to the database. With saveAs, or when the draft has no file yet, the
// user picks one in a dialog. The path never comes from the page.
//
// When something else changed the file since this app wrote it, nothing is written and Conflict is true, unless overwrite is set.
func (s *DraftService) SaveDraftToFile(d store.Draft, saveAs, overwrite bool) (FileSave, error) {
	st, err := s.db.open()
	if err != nil {
		return FileSave{}, err
	}
	d.FilePath = ""
	var base baseline
	var oldContent string
	if d.ID != "" {
		if old, err := st.Get(d.ID); err == nil {
			d.FilePath, base, oldContent = old.FilePath, baseline{old.FileMTime, old.FileHash, old.FileSize}, old.Content
		} else if !errors.Is(err, store.ErrNotFound) {
			return FileSave{}, err
		}
	}
	path := d.FilePath
	picked := false
	if saveAs || path == "" {
		pick := s.pickPath
		if pick == nil {
			pick = pickSavePath
		}
		dir, name := "", suggestName(store.Title(d.Content), d.Format)
		if path != "" { // offer the file's own name and folder, not one made from the title
			dir, name = filepath.Dir(path), filepath.Base(path)
		}
		path, err = pick(name, dir)
		if err != nil {
			return FileSave{}, err
		}
		if path == "" {
			return FileSave{Draft: d, Cancelled: true}, nil
		}
		picked = true // the dialog has already asked about replacing an existing file
	}
	if !filepath.IsAbs(path) {
		return FileSave{}, fmt.Errorf("%q is not an absolute path", path)
	}
	if len(d.Content) > store.MaxContentBytes {
		return FileSave{}, fmt.Errorf("the draft is %d bytes; the limit is %d", len(d.Content), store.MaxContentBytes)
	}
	// The draft is stored first, so that a failed file write still leaves the text safe in the database.
	saved, err := st.Save(d)
	if err != nil {
		return FileSave{}, err
	}
	saved.FilePath = d.FilePath
	if !picked {
		// The file is checked against what this app last left there (mtime, size, content hash), and read again, before every write.
		conflict, err := checkBeforeWrite(path, base, overwrite, oldContent, d.Content)
		if err != nil {
			return FileSave{}, err
		}
		if conflict {
			return FileSave{Draft: saved, Conflict: true}, nil
		}
	}
	out := d.Content
	if !picked && usesCRLF(path) { // keep the line endings of the file being replaced; the editor's text has "\n" only
		out = strings.ReplaceAll(normalizeNewlines(out), "\n", "\r\n")
	}
	if err := writeFileAtomic(path, []byte(out)); err != nil {
		return FileSave{}, fmt.Errorf("could not write %s: %w", path, err)
	}
	var mtime, size int64 = 0, -1
	if fi, err := os.Stat(path); err == nil {
		mtime, size = fi.ModTime().UnixNano(), fi.Size()
	}
	unlinked, err := st.LinkFile(saved.ID, path, mtime, d.Content, size)
	if err != nil {
		return FileSave{}, err
	}
	saved.FilePath = path
	return FileSave{Draft: saved, UnlinkedFrom: unlinked}, nil
}

// baseline is the file version this app last left (or took) at the draft's path: its mtime in Unix nanoseconds (0 none, -1 "differs",
// see MarkFileDiffers), the hash of its text and its size in bytes (-1 unknown).
type baseline struct {
	mtime int64
	hash  string
	size  int64
}

// checkBeforeWrite is what runs before every write to the draft's existing file, with the file read again just now:
//   - a file that exists but is binary, not UTF-8 or over 1 MiB is never replaced, with or without overwrite (an error);
//   - otherwise the write is a conflict, unless overwrite is set, when the file is not the version in `base`: its mtime, size or text hash
//     differs. The last case is a file changed with its mtime kept (rsync -t). A file whose text is the draft as stored before this save,
//     or the text being saved, is not a conflict (touched, or rewritten by a sync client). After MarkFileDiffers (mtime -1) only the text being
//     saved counts. A file that was reloaded and then undone is still the baseline (its mtime and hash were recorded by the reload), so a save
//     writes it: the undo was the person's decision;
//   - a missing file is written again, and a path that cannot be read at all is attempted and fails loudly.
//
// A draft linked before the hash existed (no hash) is trusted while its mtime is unchanged.
func checkBeforeWrite(path string, b baseline, overwrite bool, ownTexts ...string) (conflict bool, err error) {
	fi, err := os.Stat(path)
	if err != nil {
		return false, nil
	}
	sameMTime := b.mtime > 0 && fi.ModTime().UnixNano() == b.mtime
	if sameMTime && b.hash == "" && !overwrite {
		return false, nil
	}
	limit := int64(store.MaxContentBytes)
	if sameMTime && b.size >= 0 && fi.Size() == b.size {
		limit *= 2 // our own file: CRLF can make a 1 MiB draft up to twice as long on disk
	}
	raw, rerr := readTextFileLimit(path, limit)
	if rerr != nil {
		var nt *notText
		if errors.As(rerr, &nt) {
			return false, fmt.Errorf("%s was not overwritten: %w", path, rerr)
		}
		return false, nil
	}
	if overwrite || b.mtime == 0 {
		return false, nil
	}
	got := normalizeNewlines(raw)
	if sameMTime && b.hash != "" && (b.size < 0 || fi.Size() == b.size) && store.FileContentHash(got) == b.hash {
		return false, nil // the version we left
	}
	if b.mtime < 0 { // MarkFileDiffers: only the text being saved counts as ours
		ownTexts = ownTexts[len(ownTexts)-1:]
	}
	for _, t := range ownTexts {
		if got == normalizeNewlines(t) {
			return false, nil
		}
	}
	return true, nil
}

// normalizeNewlines turns CRLF and lone CR into LF, which is what the editor shows and the draft stores.
func normalizeNewlines(s string) string {
	return strings.ReplaceAll(strings.ReplaceAll(s, "\r\n", "\n"), "\r", "\n")
}

// usesCRLF reports whether the existing file at path ends its first line with CRLF. A missing, large or unreadable file does not.
func usesCRLF(path string) bool {
	fi, err := os.Stat(path)
	if err != nil || !fi.Mode().IsRegular() || fi.Size() > store.MaxContentBytes {
		return false
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	i := strings.IndexByte(string(raw), '\n')
	return i > 0 && raw[i-1] == '\r'
}

// MarkFileDiffers records that the draft's file no longer matches what the draft holds (the page took the file's text while the person was typing,
// so the file has a version they never saw), so the next save of
// the file reports it as changed instead of replacing it silently. Nothing is written to the file.
func (s *DraftService) MarkFileDiffers(id string) error {
	st, err := s.db.open()
	if err != nil {
		return err
	}
	d, err := st.Get(id)
	if err != nil {
		return err
	}
	if d.FilePath == "" {
		return nil
	}
	return st.SetFile(id, d.FilePath, -1) // no real file has this mtime
}

// File states, the answer of LinkedFileStatus.
const (
	FileNone    = "none"    // the draft has no file
	FileSame    = "same"    // the file is as this app left it, or only its mtime moved and the text is the draft's
	FileChanged = "changed" // something else changed the file and its text differs from the draft
	FileMissing = "missing" // the file (or its folder) is not there: deleted, moved, or a drive is not connected
	FileBroken  = "broken"  // the path cannot be used (permission denied, a folder, not a regular file, binary or not UTF-8, over 1 MiB): the page marks the link; Reason says why
)

// FileCheck is the answer to LinkedFileStatus.
type FileCheck struct {
	State string `json:"state"`
	// Reason is a plain sentence fragment for FileBroken ("permission denied", "now a folder", ...).
	Reason string `json:"reason"`
	// Stamp is the file's mtime as text (it does not fit a JavaScript number); the page uses it to remember "keep mine" for this version.
	Stamp string `json:"stamp"`
	// For FileChanged: the line counts of the file and the draft, and how many lines are only in the file or only in the draft.
	FileLines   int `json:"fileLines"`
	DraftLines  int `json:"draftLines"`
	OnlyInFile  int `json:"onlyInFile"`
	OnlyInDraft int `json:"onlyInDraft"`
	// Clean is true for FileChanged when the draft has no edits of its own since it last matched the file (its text still has the hash kept
	// then), so the file's text can replace it without losing anything. False when that is unknown (an older database) or after
	// MarkFileDiffers.
	Clean bool `json:"clean"`
}

// lineCount is the number of lines in text ("" has none; a final newline does not start another).
func lineCount(s string) int {
	if s == "" {
		return 0
	}
	return len(strings.Split(strings.TrimSuffix(s, "\n"), "\n"))
}

// lineDiff counts the lines only in a and only in b, ignoring order: a summary, not a diff.
func lineDiff(a, b string) (onlyA, onlyB int) {
	counts := map[string]int{}
	for _, l := range strings.Split(strings.TrimSuffix(a, "\n"), "\n") {
		counts[l]++
	}
	for _, l := range strings.Split(strings.TrimSuffix(b, "\n"), "\n") {
		counts[l]--
	}
	for _, n := range counts {
		if n > 0 {
			onlyA += n
		} else {
			onlyB -= n
		}
	}
	return onlyA, onlyB
}

// notText is the error for a file that exists but is binary, not UTF-8 or too large, as opposed to one that cannot be reached.
type notText struct{ msg string }

func (e *notText) Error() string { return e.msg }

// readTextFile reads a regular file of at most MaxContentBytes of valid UTF-8. The errors are plain sentences without the path (the page
// names the file): they end up in the page's message.
func readTextFile(path string) (string, error) { return readTextFileLimit(path, store.MaxContentBytes) }

func readTextFileLimit(path string, limit int64) (string, error) {
	fi, err := os.Stat(path)
	if err != nil {
		return "", readError(err)
	}
	if fi.IsDir() {
		return "", errors.New("it is now a folder")
	}
	if !fi.Mode().IsRegular() {
		return "", errors.New("it is not a regular file")
	}
	if fi.Size() > limit {
		return "", &notText{fmt.Sprintf("it is larger than %d MiB", store.MaxContentBytes>>20)}
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", readError(err)
	}
	if !utf8.Valid(raw) || bytes.IndexByte(raw, 0) >= 0 { // a NUL byte is valid UTF-8 but never text
		return "", &notText{"it is not text (binary or not UTF-8)"}
	}
	return string(raw), nil
}

func readError(err error) error {
	switch {
	case errors.Is(err, fs.ErrPermission):
		return errors.New("permission denied")
	case errors.Is(err, fs.ErrNotExist):
		return errors.New("it is not there")
	}
	return err
}

// LinkedFileStatus compares the draft's file with the draft as stored. It reads the path stored for the draft; the page names only the
// draft. A file whose mtime moved but whose text equals the draft's is quietly taken as the new baseline (state "same"). The page saves
// the draft first (flush) so that "the draft as stored" is what is on screen.
func (s *DraftService) LinkedFileStatus(id string) (FileCheck, error) {
	st, err := s.db.open()
	if err != nil {
		return FileCheck{}, err
	}
	d, err := st.Get(id)
	if err != nil {
		return FileCheck{}, err
	}
	path := d.FilePath
	if path == "" {
		return FileCheck{State: FileNone}, nil
	}
	fi, err := os.Stat(path)
	if err != nil {
		if errors.Is(err, fs.ErrNotExist) || errors.Is(err, syscall.ENOTDIR) {
			return FileCheck{State: FileMissing}, nil
		}
		return FileCheck{State: FileBroken, Reason: readError(err).Error()}, nil
	}
	mtime := fi.ModTime().UnixNano()
	stamp := strconv.FormatInt(mtime, 10)
	if d.FileMTime == 0 || d.FileMTime == mtime {
		return FileCheck{State: FileSame, Stamp: stamp}, nil
	}
	raw, err := readTextFile(path)
	if err != nil {
		return FileCheck{State: FileBroken, Reason: err.Error()}, nil
	}
	got, mine := normalizeNewlines(raw), normalizeNewlines(d.Content)
	if got == mine {
		if err := st.SetFile(id, path, mtime); err != nil { // touched only: the new baseline
			return FileCheck{}, err
		}
		if err := st.SetFileHash(id, d.Content, fi.Size()); err != nil {
			return FileCheck{}, err
		}
		return FileCheck{State: FileSame, Stamp: stamp}, nil
	}
	onlyFile, onlyDraft := lineDiff(got, mine)
	return FileCheck{State: FileChanged, Stamp: stamp, FileLines: lineCount(got), DraftLines: lineCount(mine), OnlyInFile: onlyFile, OnlyInDraft: onlyDraft, Clean: d.FileHash != "" && d.FileHash == store.FileContentHash(d.Content)}, nil
}

// LinkedFileText returns the text of the draft's file (CRLF as LF), read from the stored path, with the file's version stamp (its mtime as
// text). It is for the page's conflict dialog: the text of a Conflicted copy, and the stamp it compares again when the person chooses.
// Errors as ReloadDraftFromFile does (not there, not text, too large).
func (s *DraftService) LinkedFileText(id string) (FileText, error) {
	st, err := s.db.open()
	if err != nil {
		return FileText{}, err
	}
	d, err := st.Get(id)
	if err != nil {
		return FileText{}, err
	}
	if d.FilePath == "" {
		return FileText{}, errors.New("the draft has no file")
	}
	fi, err := os.Stat(d.FilePath)
	if err != nil {
		return FileText{}, fmt.Errorf("could not read %s: %w", d.FilePath, readError(err))
	}
	raw, err := readTextFile(d.FilePath)
	if err != nil {
		return FileText{}, fmt.Errorf("could not read %s: %w", d.FilePath, err)
	}
	return FileText{Text: normalizeNewlines(raw), Stamp: strconv.FormatInt(fi.ModTime().UnixNano(), 10)}, nil
}

// FileText is the answer to LinkedFileText.
type FileText struct {
	Text  string `json:"text"`
	Stamp string `json:"stamp"`
}

// UnlinkDraftFile removes the draft's link to its file. The draft and the file both stay as they are.
func (s *DraftService) UnlinkDraftFile(id string) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	if err := st.SetFile(id, "", 0); err != nil {
		return store.Draft{}, err
	}
	return st.Get(id)
}

// ReloadDraftFromFile replaces the draft's text with the contents of its file and returns the draft as stored. The path is the one
// stored for the draft, never one from the page. The file is taken as the new baseline (its mtime is recorded), so the next save does
// not report it as changed. A file that is missing, not a regular file, too large or not valid UTF-8 is an error and nothing changes.
func (s *DraftService) ReloadDraftFromFile(id string) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	d, err := st.Get(id)
	if err != nil {
		return store.Draft{}, err
	}
	path := d.FilePath
	if path == "" {
		return store.Draft{}, errors.New("the draft has no file")
	}
	fi, err := os.Stat(path) // before reading: a change in between is noticed by the next save
	if err != nil {
		return store.Draft{}, fmt.Errorf("could not read %s: %w", path, readError(err))
	}
	raw, err := readTextFile(path)
	if err != nil {
		return store.Draft{}, fmt.Errorf("could not read %s: %w", path, err)
	}
	d.Content = normalizeNewlines(raw) // the editor holds "\n" only, so the stored text must too
	saved, err := st.Save(d)
	if err != nil {
		return store.Draft{}, err
	}
	if err := st.SetFile(saved.ID, path, fi.ModTime().UnixNano()); err != nil {
		return store.Draft{}, err
	}
	if err := st.SetFileHash(saved.ID, saved.Content, fi.Size()); err != nil {
		return store.Draft{}, err
	}
	saved.FilePath = path
	return saved, nil
}

// writeFileAtomic writes to a temporary file beside path and renames it over path, so a crash never leaves a half-written file.
// Symbolic links are followed and an existing file keeps its permissions. Where a temporary file cannot be used (a read-only
// folder, a rename Windows blocks) an existing file is written in place instead.
func writeFileAtomic(path string, data []byte) error {
	if real, err := filepath.EvalSymlinks(path); err == nil {
		path = real
	}
	mode := os.FileMode(0o644)
	existing := false
	if fi, err := os.Stat(path); err == nil {
		if !fi.Mode().IsRegular() {
			return errors.New("it is not a regular file")
		}
		mode, existing = fi.Mode().Perm(), true
	}
	err := writeViaTemp(path, data, mode)
	var noTemp *tempUnusable
	if err != nil && existing && errors.As(err, &noTemp) {
		// Only when no temporary file could be made or moved into place. A failed write (disk full) is not retried in place: that would
		// truncate the file that is still intact.
		if werr := os.WriteFile(path, data, mode); werr == nil {
			return nil
		}
	}
	return err
}

// tempUnusable marks a failure to create the temporary file or to rename it over the target, the cases where writing in place may work.
type tempUnusable struct{ err error }

func (e *tempUnusable) Error() string { return e.err.Error() }
func (e *tempUnusable) Unwrap() error { return e.err }

func writeViaTemp(path string, data []byte, mode os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".harper-pad-*")
	if err != nil {
		return &tempUnusable{err}
	}
	defer func() { _ = os.Remove(tmp.Name()) }() // a no-op after a successful rename
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Chmod(mode); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), path); err != nil {
		return &tempUnusable{err}
	}
	return nil
}
