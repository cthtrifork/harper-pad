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
	app := application.Get()
	if app == nil {
		return "", errors.New("saving to a file needs the desktop app")
	}
	d := app.Dialog.SaveFile().SetMessage("Save this draft as a file").SetFilename(suggested).
		AddFilter("Markdown", "*.md").AddFilter("Text", "*.txt").AddFilter("All files", "*")
	if dir != "" {
		d.SetDirectory(dir)
	}
	return d.PromptForSingleSelection()
}

// SaveDraftToFile saves the draft's text to a file, and the draft itself in the database as SaveDraft does, so the draft stays
// in the scratch pad and remembers the file. With saveAs, or when the draft was never saved to a file, the user picks the file in
// a dialog; otherwise the file it was saved to before is overwritten. The path is never taken from the page: it comes from the
// dialog, or from what the database holds for the draft.
func (s *PadService) SaveDraftToFile(d store.Draft, saveAs bool) (FileSave, error) {
	st, err := s.openStore()
	if err != nil {
		return FileSave{}, err
	}
	d.FilePath = ""
	if d.ID != "" {
		if old, err := st.Get(d.ID); err == nil {
			d.FilePath = old.FilePath
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
		dir := ""
		if path != "" {
			dir = filepath.Dir(path)
		}
		path, err = pick(suggestName(store.Title(d.Content), d.Format), dir)
		if err != nil {
			return FileSave{}, err
		}
		if path == "" {
			return FileSave{Draft: d, Cancelled: true}, nil
		}
		picked = true
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
	if err := writeFileAtomic(path, []byte(d.Content)); err != nil {
		return FileSave{}, fmt.Errorf("could not write %s: %w", path, err)
	}
	if picked {
		if err := st.SetFilePath(saved.ID, path); err != nil {
			return FileSave{}, err
		}
	}
	saved.FilePath = path
	return FileSave{Draft: saved}, nil
}

// writeFileAtomic writes to a temporary file beside path and renames it over path, so a crash or a full disk never leaves a
// half-written file. An existing file keeps its permissions; a new one is readable by everyone, as an editor would make it.
func writeFileAtomic(path string, data []byte) error {
	mode := os.FileMode(0o644)
	if fi, err := os.Stat(path); err == nil {
		if !fi.Mode().IsRegular() {
			return errors.New("it is not a regular file")
		}
		mode = fi.Mode().Perm()
	}
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
