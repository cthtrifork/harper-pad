package app

import (
	"testing"

	"github.com/cthtrifork/harper-pad/internal/store"
)

// The drafts and the settings are two services on one database: one file, one connection, closed by DraftService on quit.
func TestServicesShareOneDatabase(t *testing.T) {
	svcs := newTestServices(t)
	a, err := svcs.Drafts.db.open()
	if err != nil {
		t.Fatal(err)
	}
	b, err := svcs.Settings.db.open()
	if err != nil || a != b {
		t.Fatalf("drafts and settings opened different databases: %p, %p, %v", a, b, err)
	}
	if _, err := svcs.Drafts.SaveDraft(store.Draft{Content: "kept"}); err != nil {
		t.Fatal(err)
	}
	if err := svcs.Settings.SaveSettings(Settings{Words: []string{"Wails"}}); err != nil {
		t.Fatal(err)
	}
	if err := svcs.Drafts.ServiceShutdown(); err != nil { // what Wails calls on quit
		t.Fatal(err)
	}
	// Closing through DraftService closed it for the settings too; the next use opens it again.
	if got, err := svcs.Settings.LoadSettings(); err != nil || len(got.Words) != 1 {
		t.Errorf("settings after shutdown: %+v, %v", got, err)
	}
	if l, err := svcs.Drafts.ListDrafts(10, 0); err != nil || l.Total != 1 {
		t.Errorf("drafts after shutdown: %+v, %v", l, err)
	}
}
