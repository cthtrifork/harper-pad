package app

import (
	"testing"

	"github.com/cthtrifork/harper-pad/internal/store"
)

func TestStartupFirstRun(t *testing.T) {
	st := newTestService(t).Startup()
	if st.Error != "" || st.Open != nil || st.Total != 0 {
		t.Errorf("first run: %+v", st)
	}
}

func TestStartupOpensTheMostRecentDraft(t *testing.T) {
	s := newTestService(t)
	if _, err := s.SaveDraft(store.Draft{Content: "older"}); err != nil {
		t.Fatal(err)
	}
	newest, err := s.SaveDraft(store.Draft{Content: "newest draft\nwith two lines"})
	if err != nil {
		t.Fatal(err)
	}
	st := s.Startup()
	if st.Error != "" || st.Open == nil || st.Open.ID != newest.ID || st.Open.Content != newest.Content {
		t.Fatalf("Open = %+v, error %q", st.Open, st.Error)
	}
	if st.Total != 2 {
		t.Errorf("Total = %d, want 2", st.Total)
	}
}

func TestStartupWithoutADataFolderStillAnswers(t *testing.T) {
	st := (&PadService{}).Startup()
	if st.Error == "" || st.Open != nil {
		t.Errorf("no data folder: %+v", st)
	}
}
