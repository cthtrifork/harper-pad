package app

import (
	"errors"
	"io/fs"
	"path/filepath"

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

// openStore opens the database on first use and keeps it open. A failure is not remembered, so fixing the cause
// (a full disk, a newer database replaced) works without restarting.
func (s *PadService) openStore() (*store.Store, error) {
	s.smu.Lock()
	defer s.smu.Unlock()
	if s.store != nil {
		return s.store, nil
	}
	if s.dataDir == "" {
		return nil, errNoDataDir
	}
	st, err := store.Open(filepath.Join(s.dataDir, "harper-pad.db"))
	if err != nil {
		return nil, err
	}
	s.store = st
	return st, nil
}

// ServiceShutdown closes the database when the app quits. Wails calls it.
func (s *PadService) ServiceShutdown() error {
	s.smu.Lock()
	defer s.smu.Unlock()
	if s.store == nil {
		return nil
	}
	err := s.store.Close()
	s.store = nil
	return err
}

// StartFresh moves the database aside as harper-pad.db.bad-<time> and starts a new, empty one. The page offers it when the
// drafts cannot be read; the old file is kept, never deleted. It returns where the old file went.
func (s *PadService) StartFresh() (string, error) {
	s.smu.Lock()
	defer s.smu.Unlock()
	if s.dataDir == "" {
		return "", errNoDataDir
	}
	if s.store != nil {
		_ = s.store.Close()
		s.store = nil
	}
	path := filepath.Join(s.dataDir, "harper-pad.db")
	bad, err := store.MoveAside(path)
	if errors.Is(err, fs.ErrNotExist) {
		return "", nil // nothing to move: the next open creates the database
	}
	return bad, err
}
