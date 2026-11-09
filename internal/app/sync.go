package app

import (
	"github.com/cthtrifork/harper-pad/internal/store"
)

// SyncService is the Wails binding for what the sync client needs from the database: which drafts exist and which are changed, the state
// recorded at the last sync, and the two ways of storing what the server holds. The sync client itself (frontend/src/lib/syncRun.ts) runs in
// the page, and the device's token and key stay in the webview's IndexedDB, so nothing here touches the network or a secret; these are the
// same operations the web build does against IndexedDB (frontend/src/lib/webDrafts.ts), and the same rules, checked by the same fixtures.
type SyncService struct {
	db *database
}

// AllDraftIDs returns the id of every draft.
func (s *SyncService) AllDraftIDs() ([]string, error) {
	st, err := s.db.open()
	if err != nil {
		return nil, err
	}
	return st.AllIDs()
}

// DraftChanged reports whether one draft differs from what the server last held (false when there is no such draft).
func (s *SyncService) DraftChanged(id string) (bool, error) {
	st, err := s.db.open()
	if err != nil {
		return false, err
	}
	return st.IsChanged(id)
}

// DraftChanges lists the drafts to upload and the drafts deleted here that the server still has. It reads every draft, so it is for Sync all.
func (s *SyncService) DraftChanges() (store.Changes, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Changes{}, err
	}
	return st.Changes()
}

// DraftSyncState returns what the server held for a draft at the last sync, or nil when it was never told about it.
func (s *SyncService) DraftSyncState(id string) (*store.SyncState, error) {
	st, err := s.db.open()
	if err != nil {
		return nil, err
	}
	state, ok, err := st.SyncState(id)
	if err != nil || !ok {
		return nil, err
	}
	return &state, nil
}

// MarkSynced records what the server now holds for a draft, after a push it accepted.
func (s *SyncService) MarkSynced(id string, state store.SyncState) error {
	st, err := s.db.open()
	if err != nil {
		return err
	}
	return st.MarkSynced(id, state)
}

// ApplyRemote stores a draft as the server has it, with the server's times, and records it as synced. The same checks as SaveDraft apply.
func (s *SyncService) ApplyRemote(d store.Draft, version int64) (store.Draft, error) {
	st, err := s.db.open()
	if err != nil {
		return store.Draft{}, err
	}
	return st.ApplyRemote(d, version)
}

// ApplyRemoteIf is ApplyRemote for a draft whose stored update time must still be `expected`; it reports whether the server's version was
// stored. False means the draft was saved meanwhile and nothing was written.
func (s *SyncService) ApplyRemoteIf(d store.Draft, version, expected int64) (bool, error) {
	st, err := s.db.open()
	if err != nil {
		return false, err
	}
	return st.ApplyRemoteIf(d, version, expected)
}

// ApplyRemoteDelete removes a draft because the server's copy is a tombstone, and records that, so it is not a pending delete.
func (s *SyncService) ApplyRemoteDelete(id string, version, updatedAt int64) error {
	st, err := s.db.open()
	if err != nil {
		return err
	}
	return st.ApplyRemoteDelete(id, version, updatedAt)
}
