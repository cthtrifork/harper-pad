package app

import (
	"errors"
	"testing"

	"github.com/cthtrifork/harper-pad/internal/store"
)

func TestDraftsThroughTheService(t *testing.T) {
	s := newTestService(t)
	d, err := s.SaveDraft(store.Draft{Content: "# Plan\n- [ ] one\n- [x] two"})
	if err != nil {
		t.Fatal(err)
	}
	l, err := s.ListDrafts(10, 0)
	if err != nil || l.Total != 1 || l.Drafts[0].Title != "Plan" || l.Drafts[0].TasksTotal != 2 {
		t.Fatalf("ListDrafts = %+v, %v", l, err)
	}
	if got, err := s.GetDraft(d.ID); err != nil || got.Content != d.Content {
		t.Errorf("GetDraft = %+v, %v", got, err)
	}
	if l, _ := s.SearchDrafts("one", 10); l.Total != 1 {
		t.Errorf("SearchDrafts found %d", l.Total)
	}
	if err := s.DeleteDraft(d.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := s.GetDraft(d.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetDraft after delete = %v", err)
	}
	if _, err := s.SaveDraft(d); err != nil { // undo
		t.Errorf("restore: %v", err)
	}
}

func TestDraftsSurviveARestart(t *testing.T) {
	s := newTestService(t)
	d, _ := s.SaveDraft(store.Draft{Content: "still here"})
	if err := s.ServiceShutdown(); err != nil {
		t.Fatal(err)
	}
	again := &PadService{dataDir: s.dataDir}
	t.Cleanup(func() { _ = again.ServiceShutdown() })
	if got, err := again.GetDraft(d.ID); err != nil || got.Content != "still here" {
		t.Errorf("after restart: %+v, %v", got, err)
	}
}

func TestDraftsWithoutDataFolder(t *testing.T) {
	s := &PadService{}
	if _, err := s.ListDrafts(10, 0); err == nil {
		t.Error("ListDrafts succeeded without a folder")
	}
	if err := s.ServiceShutdown(); err != nil {
		t.Errorf("ServiceShutdown with nothing open: %v", err)
	}
}
