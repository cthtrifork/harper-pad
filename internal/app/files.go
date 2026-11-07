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
	var storedHash, oldContent string
	if d.ID != "" {
		if old, err := st.Get(d.ID); err == nil {
			d.FilePath, storedHash, oldContent = old.FilePath, old.FileHash, old.Content
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
		// The file is read again before every write and compared with what this app last left there.
		conflict, err := checkBeforeWrite(path, storedHash, overwrite, oldContent, d.Content)
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
	var mtime int64
	if fi, err := os.Stat(path); err == nil {
		mtime = fi.ModTime().UnixNano()
	}
	unlinked, err := st.LinkFile(saved.ID, path, mtime, d.Content)
	if err != nil {
		return FileSave{}, err
	}
	saved.FilePath = path
	return FileSave{Draft: saved, UnlinkedFrom: unlinked}, nil
}

// checkBeforeWrite runs before every write to the draft's existing file, with the file read again just now (see readTextFile):
//   - a file that exists but is binary, not UTF-8 or too large is never replaced, with or without overwrite (an error);
//   - otherwise the write is a conflict, unless overwrite is set, when the file's text differs from all of: the text this app last left there
//     (`storedHash`, the hash of its normalised text; "" for a link that has none), the draft as stored before this save, and the text being
//     saved. So a file that was only touched, rewritten with the same text, or reloaded and then undone is written; one whose text changed is
//     not, whatever its modified time says (rsync -t);
//   - a missing file is written again, and a path that cannot be read at all is attempted and fails loudly.
func checkBeforeWrite(path, storedHash string, overwrite bool, ownTexts ...string) (conflict bool, err error) {
	if _, err := os.Stat(path); err != nil {
		return false, nil
	}
	got, rerr := readTextFile(path)
	if rerr != nil {
		var nt *notText
		if errors.As(rerr, &nt) {
			return false, fmt.Errorf("%s was not overwritten: %w", path, rerr)
		}
		return false, nil
	}
	if overwrite {
		return false, nil
	}
	if storedHash != "" && store.FileContentHash(got) == storedHash {
		return false, nil
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

// usesCRLF reports whether the existing file at path ends its first line with CRLF (only the start of the file is read). A missing or
// unreadable file does not.
func usesCRLF(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer func() { _ = f.Close() }()
	buf := make([]byte, 64<<10)
	n, _ := f.Read(buf)
	i := bytes.IndexByte(buf[:n], '\n')
	return i > 0 && buf[i-1] == '\r'
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
	// Clean is true for FileChanged when the draft has no edits of its own since it last matched the file (its text still has the hash kept
	// then), so the file's text can replace it without losing anything. False when that is unknown (a link without a hash).
	Clean bool `json:"clean"`
}

// notText is the error for a file that exists but is binary, not UTF-8 or too large, as opposed to one that cannot be reached.
type notText struct{ msg string }

func (e *notText) Error() string { return e.msg }

// readTextFile is the one rule for what text a file may hold, for the status check, the write check and the reads alike: a regular file of
// valid UTF-8 without NUL bytes whose text, with CRLF and CR turned into LF, is at most MaxContentBytes. So a CRLF file written from a full
// draft is fine everywhere, and anything bigger is "larger than 1 MiB" everywhere. It returns that LF text. The errors are plain sentences
// without the path (the page names the file).
func readTextFile(path string) (string, error) {
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
	tooLarge := &notText{fmt.Sprintf("it is larger than %d MiB", store.MaxContentBytes>>20)}
	if fi.Size() > 2*store.MaxContentBytes { // CRLF at most doubles a text: no need to read more
		return "", tooLarge
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		return "", readError(err)
	}
	if !utf8.Valid(raw) || bytes.IndexByte(raw, 0) >= 0 { // a NUL byte is valid UTF-8 but never text
		return "", &notText{"it is not text (binary or not UTF-8)"}
	}
	text := normalizeNewlines(string(raw))
	if len(text) > store.MaxContentBytes {
		return "", tooLarge
	}
	return text, nil
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
	got, err := readTextFile(path)
	if err != nil {
		return FileCheck{State: FileBroken, Reason: err.Error()}, nil
	}
	if got == normalizeNewlines(d.Content) || store.FileContentHash(got) == d.FileHash {
		// Only the mtime moved: the text is the draft's, or the one this app last left. That is the baseline again.
		if err := st.SetFile(id, path, mtime); err != nil {
			return FileCheck{}, err
		}
		if err := st.SetFileHash(id, got); err != nil {
			return FileCheck{}, err
		}
		return FileCheck{State: FileSame, Stamp: stamp}, nil
	}
	return FileCheck{State: FileChanged, Stamp: stamp, Clean: d.FileHash != "" && d.FileHash == store.FileContentHash(d.Content)}, nil
}

// LinkedFileText returns the text of the draft's file (CRLF as LF), read from the stored path, with the file's version stamp (its mtime as
// text). It is for the page's conflict dialog: the text of a Conflicted copy, and the stamp it compares again when the person chooses.
// An error says why when the file is not there, not text or too large.
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
	return FileText{Text: raw, Stamp: strconv.FormatInt(fi.ModTime().UnixNano(), 10)}, nil
}

// FileText is the answer to LinkedFileText.
type FileText struct {
	Text  string `json:"text"`
	Stamp string `json:"stamp"`
}

// UnlinkDraftFile removes the draft's link to its file. The draft and the file both stay as they are. The link (path and baseline) is kept
// in memory, so UndoUnlinkDraftFile can restore it; the page never names a path.
func (s *DraftService) UnlinkDraftFile(id string) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	before, err := st.Get(id)
	if err != nil {
		return store.Draft{}, err
	}
	if err := st.SetFile(id, "", 0); err != nil {
		return store.Draft{}, err
	}
	if before.FilePath != "" {
		s.mu.Lock()
		if s.unlinked == nil {
			s.unlinked = map[string]store.Draft{}
		}
		s.unlinked[id] = before
		s.mu.Unlock()
	}
	return st.Get(id)
}

// UndoUnlinkDraftFile restores the link UnlinkDraftFile removed last for this draft: the same path and the same baseline (modified time,
// size and text hash), and nothing else. Another draft linked to that path in the meantime loses it, as after Save to disk. An error when
// there is nothing to restore or the draft got a link since.
func (s *DraftService) UndoUnlinkDraftFile(id string) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	s.mu.Lock()
	before, ok := s.unlinked[id]
	delete(s.unlinked, id)
	s.mu.Unlock()
	if !ok {
		return store.Draft{}, errors.New("there is no link to restore")
	}
	cur, err := st.Get(id)
	if err != nil {
		return store.Draft{}, err
	}
	if cur.FilePath != "" {
		return store.Draft{}, errors.New("the draft is linked to a file already")
	}
	if err := st.RestoreFile(id, before.FilePath, before.FileMTime, before.FileHash); err != nil {
		return store.Draft{}, err
	}
	return st.Get(id)
}

// RecordLinkedFile makes the file's current text the baseline of the draft's link (its modified time and text hash), once the page has taken
// that text into the draft: the draft is clean afterwards, and a later change of the file is a change. `stamp` is the one LinkedFileText
// returned; if the file changed again since, nothing is recorded and the error says so.
func (s *DraftService) RecordLinkedFile(id, stamp string) error {
	st, err := s.db.open()
	if err != nil {
		return err
	}
	d, err := st.Get(id)
	if err != nil {
		return err
	}
	if d.FilePath == "" {
		return errors.New("the draft has no file")
	}
	fi, err := os.Stat(d.FilePath)
	if err != nil {
		return fmt.Errorf("could not read %s: %w", d.FilePath, readError(err))
	}
	if strconv.FormatInt(fi.ModTime().UnixNano(), 10) != stamp {
		return errors.New("the file changed again")
	}
	raw, err := readTextFile(d.FilePath)
	if err != nil {
		return fmt.Errorf("could not read %s: %w", d.FilePath, err)
	}
	if err := st.SetFile(id, d.FilePath, fi.ModTime().UnixNano()); err != nil {
		return err
	}
	return st.SetFileHash(id, raw)
}

// writeFileAtomic writes to a temporary file beside path and renames it over path, so a crash or a failed write never leaves a half-written
// file: the write is whole or it fails with the reason. Symbolic links are followed and an existing file keeps its permissions.
func writeFileAtomic(path string, data []byte) error {
	if real, err := filepath.EvalSymlinks(path); err == nil {
		path = real
	}
	mode := os.FileMode(0o644)
	if fi, err := os.Stat(path); err == nil {
		if !fi.Mode().IsRegular() {
			return errors.New("it is not a regular file")
		}
		mode = fi.Mode().Perm()
	}
	return writeViaTemp(path, data, mode)
}

func writeViaTemp(path string, data []byte, mode os.FileMode) error {
	tmp, err := os.CreateTemp(filepath.Dir(path), ".harper-pad-*")
	if err != nil {
		return err
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
	return os.Rename(tmp.Name(), path)
}
