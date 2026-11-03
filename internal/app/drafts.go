package app

import "github.com/cthtrifork/harper-pad/internal/store"

// ListDrafts returns a page of drafts, newest first, with a title, an excerpt and a task preview for each.
func (s *PadService) ListDrafts(limit, offset int) (store.List, error) {
	st, err := s.openStore()
	if err != nil {
		return store.List{}, err
	}
	return st.List(limit, offset)
}

// SearchDrafts returns the drafts whose text contains query, newest first.
func (s *PadService) SearchDrafts(query string, limit int) (store.List, error) {
	st, err := s.openStore()
	if err != nil {
		return store.List{}, err
	}
	return st.Search(query, limit)
}

// GetDraft returns one draft with its full content.
func (s *PadService) GetDraft(id string) (store.Draft, error) {
	st, err := s.openStore()
	if err != nil {
		return store.Draft{}, err
	}
	return st.Get(id)
}

// SaveDraft creates a draft (empty id) or updates one, and returns it as stored. Saving a draft whose id is no longer
// stored brings it back, which is how deleting is undone.
func (s *PadService) SaveDraft(d store.Draft) (store.Draft, error) {
	st, err := s.openStore()
	if err != nil {
		return store.Draft{}, err
	}
	return st.Save(d)
}

// DeleteDraft removes a draft. Deleting one that is not there is not an error.
func (s *PadService) DeleteDraft(id string) error {
	st, err := s.openStore()
	if err != nil {
		return err
	}
	return st.Delete(id)
}
