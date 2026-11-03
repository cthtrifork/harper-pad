package store

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestSettingsEmptyThenRoundTrip(t *testing.T) {
	s, path := open(t)
	if got, err := s.Settings(); err != nil || len(got) != 0 {
		t.Fatalf("a new database has settings %v, %v", got, err)
	}
	if err := s.SetSettings(map[string]string{"words": `["Wails","bootc"]`, "ignored": `{"context_hashes":[1]}`}); err != nil {
		t.Fatal(err)
	}
	// Setting one key leaves the others, and replaces its own value.
	if err := s.SetSettings(map[string]string{"words": `["nfpm"]`}); err != nil {
		t.Fatal(err)
	}
	got, _ := s.Settings()
	if got["words"] != `["nfpm"]` || got["ignored"] != `{"context_hashes":[1]}` || len(got) != 2 {
		t.Errorf("Settings = %v", got)
	}
	// And they are still there after the app restarts.
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	again, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	if got, _ := again.Settings(); got["words"] != `["nfpm"]` {
		t.Errorf("after reopen: %v", got)
	}
}

func TestSettingsAllOrNothing(t *testing.T) {
	s, _ := open(t)
	if err := s.SetSettings(map[string]string{"words": "a", "": "bad"}); err == nil {
		t.Fatal("an empty key was accepted")
	}
	if got, _ := s.Settings(); len(got) != 0 {
		t.Errorf("a failed SetSettings left %v behind", got)
	}
}

func TestSettingsAndDraftsShareOneFile(t *testing.T) {
	s, path := open(t)
	if _, err := s.Save(Draft{Content: "a draft"}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetSettings(map[string]string{"words": `["x"]`}); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(filepath.Dir(path))
	if len(entries) != 1 {
		t.Errorf("the folder holds %v, want one file", entries)
	}
	if l, _ := s.List(10, 0); l.Total != 1 {
		t.Errorf("drafts = %d", l.Total)
	}
}

func TestDamagedFileLosesSettingsToo(t *testing.T) {
	path := filepath.Join(t.TempDir(), "harper-pad.db")
	if err := os.WriteFile(path, []byte(strings.Repeat("junk ", 500)), 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer s.Close()
	if got, err := s.Settings(); err != nil || len(got) != 0 {
		t.Errorf("Settings after recovery = %v, %v", got, err)
	}
}
