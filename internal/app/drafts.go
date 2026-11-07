package app

import (
	"sync"

	"github.com/cthtrifork/harper-pad/internal/store"
)

// DraftService is the Wails binding for the scratch pad: the drafts in the database, saving one to a file, and recovering from a
// database that cannot be read.
type DraftService struct {
	db       *database
	pickPath func(suggested, dir string) (string, error) // the save dialog; nil means the real one (replaced in tests)

	mu       sync.Mutex
	unlinked map[string]store.Draft // the link each draft had when it was last unlinked, for UndoUnlinkDraftFile; in memory only
}

// ServiceShutdown closes the database when the app quits. Wails calls it.
func (s *DraftService) ServiceShutdown() error { return s.db.close() }

// StartFresh moves the database aside as harper-pad.db.bad-<time> and starts a new, empty one. The page offers it when the
// drafts cannot be read; the old file is kept, never deleted. It returns where the old file went.
func (s *DraftService) StartFresh() (string, error) { return s.db.startFresh() }

// ListDrafts returns a page of drafts, newest first, with a title, an excerpt and a task preview for each.
func (s *DraftService) ListDrafts(limit, offset int) (store.List, error) {
	st, err := s.db.open()
	if err != nil {
		return store.List{}, err
	}
	return st.List(limit, offset)
}

// SearchDrafts returns the drafts whose text contains query, newest first.
func (s *DraftService) SearchDrafts(query string, limit int) (store.List, error) {
	st, err := s.db.open()
	if err != nil {
		return store.List{}, err
	}
	return st.Search(query, limit)
}

// GetDraft returns one draft with its full content.
func (s *DraftService) GetDraft(id string) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	return st.Get(id)
}

// SaveDraft creates a draft (empty id) or updates one, and returns it as stored. Saving a draft whose id is no longer
// stored brings it back, which is how deleting is undone.
func (s *DraftService) SaveDraft(d store.Draft) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	return st.Save(d)
}

// DeleteDraft removes a draft. Deleting one that is not there is not an error.
func (s *DraftService) DeleteDraft(id string) error {
	st, err := s.db.open()
	if err != nil {
		return err
	}
	return st.Delete(id)
}
