package app

import (
	"errors"
	"io/fs"
	"path/filepath"
	"sync"

	"github.com/cthtrifork/harper-pad/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// dataDir is where harper-pad.db lives: the user's data folder, in a folder named after the app.
// Linux: ~/.local/share/harper-pad (XDG_DATA_HOME); Windows: %LOCALAPPDATA%\harper-pad.
func dataDir() string {
	base := application.Path(application.PathDataHome)
	if base == "" {
		return ""
	}
	return filepath.Join(base, "harper-pad")
}

// errNoDataDir is returned when there is no folder to keep the database in.
var errNoDataDir = errors.New("the user's data folder could not be found, so nothing can be saved")

// database is the app's one SQLite file, opened on first use and shared by the services that read or write it (the drafts and
// the settings), so they never hold two connections to the same file.
type database struct {
	dir string     // where the file lives (see dataDir); empty when the user's data folder is unknown
	mu  sync.Mutex // guards st
	st  *store.Store
}

// newDatabase returns a database that keeps its file in dir.
func newDatabase(dir string) *database { return &database{dir: dir} }

// open opens the database on first use and keeps it open. A failure is not remembered, so fixing the cause
// (a full disk, a newer database replaced) works without restarting.
func (d *database) open() (*store.Store, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.st != nil {
		return d.st, nil
	}
	if d.dir == "" {
		return nil, errNoDataDir
	}
	st, err := store.Open(filepath.Join(d.dir, "harper-pad.db"))
	if err != nil {
		return nil, err
	}
	d.st = st
	return st, nil
}

// close closes the database if it is open.
func (d *database) close() error {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.st == nil {
		return nil
	}
	err := d.st.Close()
	d.st = nil
	return err
}

// startFresh moves the database aside as harper-pad.db.bad-<time> and leaves a new, empty one to be created on the next open. It
// returns where the old file went, or "" when there was nothing to move.
func (d *database) startFresh() (string, error) {
	d.mu.Lock()
	defer d.mu.Unlock()
	if d.dir == "" {
		return "", errNoDataDir
	}
	if d.st != nil {
		_ = d.st.Close()
		d.st = nil
	}
	path := filepath.Join(d.dir, "harper-pad.db")
	bad, err := store.MoveAside(path)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil // nothing to move: the next open creates the database
	}
	return bad, err
}
