package app

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

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

// SaveDraftToFile saves the draft's text to a file, and the draft itself in the database as SaveDraft does, so the draft stays
// in the scratch pad and remembers the file. With saveAs, or when the draft was never saved to a file, the user picks the file in
// a dialog; otherwise the file it was saved to before is overwritten. The path is never taken from the page: it comes from the
// dialog, or from what the database holds for the draft.
//
// When the file was changed by something else since this app last wrote it, nothing is written and Conflict is true, unless
// overwrite is set (the page sets it when the user saves again after being told). A file that is gone is simply written again.
func (s *DraftService) SaveDraftToFile(d store.Draft, saveAs, overwrite bool) (FileSave, error) {
	st, err := s.db.open()
	if err != nil {
		return FileSave{}, err
	}
	d.FilePath = ""
	var wroteAt int64
	if d.ID != "" {
		if old, err := st.Get(d.ID); err == nil {
			d.FilePath, wroteAt = old.FilePath, old.FileMTime
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
	if !picked && !overwrite && wroteAt != 0 {
		if fi, err := os.Stat(path); err == nil && fi.ModTime().UnixNano() != wroteAt {
			return FileSave{Draft: saved, Conflict: true}, nil
		}
	}
	if err := writeFileAtomic(path, []byte(d.Content)); err != nil {
		return FileSave{}, fmt.Errorf("could not write %s: %w", path, err)
	}
	var mtime int64
	if fi, err := os.Stat(path); err == nil {
		mtime = fi.ModTime().UnixNano()
	}
	if err := st.SetFile(saved.ID, path, mtime); err != nil {
		return FileSave{}, err
	}
	saved.FilePath = path
	return FileSave{Draft: saved}, nil
}

// writeFileAtomic writes to a temporary file beside path and renames it over path, so a crash or a full disk never leaves a
// half-written file. A symbolic link is followed, so the link stays a link. An existing file keeps its permissions; a new one is
// readable by everyone, as an editor would make it. When a temporary file cannot be used (a read-only folder holding a writable
// file, or a rename a program on Windows blocks) an existing file is written in place instead.
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
	if err != nil && existing {
		if werr := os.WriteFile(path, data, mode); werr == nil {
			return nil
		}
	}
	return err
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
