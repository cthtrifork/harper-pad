package app

import (
	"encoding/json"
	"reflect"
	"testing"

	"github.com/cthtrifork/harper-pad/internal/store"
)

// The page reads these as JSON, with the field names the web store uses (frontend/src/lib/webDrafts.ts); renaming one breaks sync on desktop.
func TestSyncTypesAreJSONTheWebStoreWouldSend(t *testing.T) {
	st, _ := json.Marshal(store.SyncState{Hash: "h", UpdatedAt: 2, Deleted: true, Version: 3})
	if string(st) != `{"hash":"h","updatedAt":2,"deleted":true,"version":3}` {
		t.Errorf("SyncState = %s", st)
	}
	ch, _ := json.Marshal(store.Changes{Changed: []string{"a"}, Deleted: []string{}})
	if string(ch) != `{"changed":["a"],"deleted":[]}` {
		t.Errorf("Changes = %s", ch)
	}
}

func TestSyncServiceFollowsADraftThroughASync(t *testing.T) {
	svc := newTestServices(t)
	d, err := svc.Drafts.SaveDraft(store.Draft{Content: "one"})
	if err != nil {
		t.Fatal(err)
	}
	if ids, err := svc.Sync.AllDraftIDs(); err != nil || !reflect.DeepEqual(ids, []string{d.ID}) {
		t.Fatalf("AllDraftIDs = %v, %v", ids, err)
	}
	if st, err := svc.Sync.DraftSyncState(d.ID); err != nil || st != nil {
		t.Fatalf("a draft the server never had has no state: %v, %v", st, err)
	}
	if changed, err := svc.Sync.DraftChanged(d.ID); err != nil || !changed {
		t.Fatalf("a new draft is changed: %v, %v", changed, err)
	}
	if c, err := svc.Sync.DraftChanges(); err != nil || !reflect.DeepEqual(c.Changed, []string{d.ID}) {
		t.Fatalf("DraftChanges = %+v, %v", c, err)
	}

	state := store.SyncState{Hash: store.ContentHash(d.Format, d.Content), UpdatedAt: d.UpdatedAt, Version: 1}
	if err := svc.Sync.MarkSynced(d.ID, state); err != nil {
		t.Fatal(err)
	}
	if got, err := svc.Sync.DraftSyncState(d.ID); err != nil || got == nil || *got != state {
		t.Fatalf("DraftSyncState = %+v, %v", got, err)
	}
	if changed, _ := svc.Sync.DraftChanged(d.ID); changed {
		t.Error("a synced draft is not changed")
	}

	// What the server holds replaces the text without touching the times, and is recorded as synced.
	got, err := svc.Sync.ApplyRemote(store.Draft{ID: d.ID, Format: store.FormatMarkdown, Content: "from the server", CreatedAt: 10, UpdatedAt: 20}, 2)
	if err != nil || got.Content != "from the server" || got.UpdatedAt != 20 {
		t.Fatalf("ApplyRemote = %+v, %v", got, err)
	}
	if changed, _ := svc.Sync.DraftChanged(d.ID); changed {
		t.Error("a draft taken from the server is not changed")
	}

	// A tombstone removes it and is recorded, so it is not a pending delete.
	if err := svc.Sync.ApplyRemoteDelete(d.ID, 3, 30); err != nil {
		t.Fatal(err)
	}
	if ids, _ := svc.Sync.AllDraftIDs(); len(ids) != 0 {
		t.Errorf("the draft is still there: %v", ids)
	}
	if c, _ := svc.Sync.DraftChanges(); len(c.Deleted) != 0 {
		t.Errorf("a tombstone from the server is not a pending delete: %+v", c)
	}
}

func TestSyncServiceRefusesWhatSaveRefuses(t *testing.T) {
	svc := newTestServices(t)
	if _, err := svc.Sync.ApplyRemote(store.Draft{ID: "not-an-id", Content: "x", CreatedAt: 1, UpdatedAt: 1}, 1); err == nil {
		t.Error("a bad id was accepted")
	}
	if err := svc.Sync.MarkSynced("not-an-id", store.SyncState{}); err == nil {
		t.Error("a bad id was accepted")
	}
}
