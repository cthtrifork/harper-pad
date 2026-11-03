package app

import (
	"errors"
	"path/filepath"

	"github.com/cthtrifork/harper-pad/internal/drafts"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// draftsDir is where drafts.db lives: the user's data folder, in a folder named after the app.
// Linux: ~/.local/share/harper-pad (XDG_DATA_HOME); Windows: %LOCALAPPDATA%\harper-pad.
func draftsDir() string {
	base := application.Path(application.PathDataHome)
	if base == "" {
		return ""
	}
	return filepath.Join(base, "harper-pad")
}

// draftStore opens the drafts database on first use and keeps it open. A failure is not remembered, so fixing the
// cause (a full disk, a newer database replaced) works without restarting.
func (s *PadService) draftStore() (*drafts.Store, error) {
	s.dmu.Lock()
	defer s.dmu.Unlock()
	if s.drafts != nil {
		return s.drafts, nil
	}
	if s.dataDir == "" {
		return nil, errors.New("the user's data folder could not be found, so drafts cannot be kept")
	}
	st, err := drafts.Open(filepath.Join(s.dataDir, "drafts.db"))
	if err != nil {
		return nil, err
	}
	s.drafts = st
	return st, nil
}

// ListDrafts returns a page of drafts, newest first, with a title, an excerpt and a task preview for each.
func (s *PadService) ListDrafts(limit, offset int) (drafts.List, error) {
	st, err := s.draftStore()
	if err != nil {
		return drafts.List{}, err
	}
	return st.List(limit, offset)
}

// SearchDrafts returns the drafts whose text contains query, newest first.
func (s *PadService) SearchDrafts(query string, limit int) (drafts.List, error) {
	st, err := s.draftStore()
	if err != nil {
		return drafts.List{}, err
	}
	return st.Search(query, limit)
}

// GetDraft returns one draft with its full content.
func (s *PadService) GetDraft(id string) (drafts.Draft, error) {
	st, err := s.draftStore()
	if err != nil {
		return drafts.Draft{}, err
	}
	return st.Get(id)
}

// SaveDraft creates a draft (empty id) or updates one, and returns it as stored. Saving a draft whose id is no longer
// stored brings it back, which is how deleting is undone.
func (s *PadService) SaveDraft(d drafts.Draft) (drafts.Draft, error) {
	st, err := s.draftStore()
	if err != nil {
		return drafts.Draft{}, err
	}
	return st.Save(d)
}

// DeleteDraft removes a draft. Deleting one that is not there is not an error.
func (s *PadService) DeleteDraft(id string) error {
	st, err := s.draftStore()
	if err != nil {
		return err
	}
	return st.Delete(id)
}

// ServiceShutdown closes the drafts database when the app quits. Wails calls it.
func (s *PadService) ServiceShutdown() error {
	s.dmu.Lock()
	defer s.dmu.Unlock()
	if s.drafts == nil {
		return nil
	}
	err := s.drafts.Close()
	s.drafts = nil
	return err
}
