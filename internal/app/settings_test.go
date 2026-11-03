package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func newTestService(t *testing.T) *PadService {
	t.Helper()
	return &PadService{dir: filepath.Join(t.TempDir(), "harper-pad")}
}

func TestSettingsFirstRunIsEmpty(t *testing.T) {
	got, err := newTestService(t).LoadSettings()
	if err != nil || len(got.Words) != 0 || got.Ignored != "" || got.Version != settingsVersion {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
}

func TestSettingsRoundTripAndClean(t *testing.T) {
	s := newTestService(t)
	in := Settings{Words: []string{" Wails ", "bootc", "Wails", "", "nfpm", "Wails"}, Ignored: `[1,2,3]`}
	if err := s.SaveSettings(in); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got.Words, ",") != "Wails,bootc,nfpm" || got.Ignored != `[1,2,3]` {
		t.Errorf("LoadSettings = %+v", got)
	}
	// A second service on the same folder sees the same data, as after a restart.
	again, _ := (&PadService{dir: s.dir}).LoadSettings()
	if strings.Join(again.Words, ",") != "Wails,bootc,nfpm" {
		t.Errorf("after restart: %+v", again)
	}
}

func TestSettingsRejectBadInput(t *testing.T) {
	s := newTestService(t)
	many := make([]string, maxWords+1)
	for i := range many {
		many[i] = fmt.Sprintf("word%d", i)
	}
	for name, in := range map[string]Settings{
		"a phrase":       {Words: []string{"two words"}},
		"a control char": {Words: []string{"bad\x00word"}},
		"too long":       {Words: []string{strings.Repeat("a", maxWordRunes+1)}},
		"too many words": {Words: many},
		"bad json":       {Ignored: "{not json"},
		"huge ignore":    {Ignored: `"` + strings.Repeat("a", maxIgnoredBytes) + `"`},
	} {
		if err := s.SaveSettings(in); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
	if _, err := os.Stat(filepath.Join(s.dir, "settings.json")); !os.IsNotExist(err) {
		t.Errorf("a rejected save wrote a file: %v", err)
	}
}

func TestSettingsDamagedFileStartsEmpty(t *testing.T) {
	s := newTestService(t)
	if err := os.MkdirAll(s.dir, 0o700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(s.dir, "settings.json")
	if err := os.WriteFile(path, []byte("{broken"), 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadSettings()
	if err != nil || len(got.Words) != 0 {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
	if _, err := os.Stat(path + ".bad"); err != nil {
		t.Errorf("the damaged file was not kept: %v", err)
	}
	if err := s.SaveSettings(Settings{Words: []string{"ok"}}); err != nil {
		t.Errorf("saving after recovery: %v", err)
	}
}

func TestSettingsWithoutConfigFolder(t *testing.T) {
	s := &PadService{}
	if got, err := s.LoadSettings(); err != nil || len(got.Words) != 0 {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
	if err := s.SaveSettings(Settings{}); err == nil {
		t.Error("SaveSettings succeeded without a folder")
	}
}
