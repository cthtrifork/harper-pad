package app

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// newTestServices returns the services on a database in a temporary folder, closed when the test ends.
func newTestServices(t *testing.T) *Services {
	t.Helper()
	db := newDatabase(filepath.Join(t.TempDir(), "harper-pad"))
	t.Cleanup(func() { _ = db.close() })
	return newServices(db)
}

func TestSettingsFirstRunIsEmpty(t *testing.T) {
	got, err := newTestServices(t).Settings.LoadSettings()
	if err != nil || len(got.Words) != 0 || got.Ignored != "" || got.Version != settingsVersion {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
}

func TestSettingsRoundTripAndClean(t *testing.T) {
	s := newTestServices(t).Settings
	in := Settings{Words: []string{" Wails ", "bootc", "Wails", "", "nfpm", "Wails"}, Ignored: `{"context_hashes":[1,2,3]}`}
	if err := s.SaveSettings(in); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Join(got.Words, ",") != "Wails,bootc,nfpm" || got.Ignored != `{"context_hashes":[1,2,3]}` {
		t.Errorf("LoadSettings = %+v", got)
	}
	// A second service on the same folder sees the same data, as after a restart.
	if err := s.db.close(); err != nil {
		t.Fatal(err)
	}
	again := &SettingsService{db: newDatabase(s.db.dir)}
	t.Cleanup(func() { _ = again.db.close() })
	got, _ = again.LoadSettings()
	if strings.Join(got.Words, ",") != "Wails,bootc,nfpm" {
		t.Errorf("after restart: %+v", got)
	}
}

func TestSettingsRejectBadInput(t *testing.T) {
	s := newTestServices(t).Settings
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
		"bad label hash": {IgnoredLabels: map[string]string{"12x": "a"}},
		"huge ignore":    {Ignored: `"` + strings.Repeat("a", maxIgnoredBytes) + `"`},
	} {
		if err := s.SaveSettings(in); err == nil {
			t.Errorf("%s was accepted", name)
		}
	}
	if got, _ := s.LoadSettings(); len(got.Words) != 0 || got.Ignored != "" {
		t.Errorf("a rejected save changed the settings: %+v", got)
	}
}

func TestSettingsUnusableSavedValuesStartEmpty(t *testing.T) {
	s := newTestServices(t).Settings
	st, err := s.db.open()
	if err != nil {
		t.Fatal(err)
	}
	if err := st.SetSettings(map[string]string{"words": "{not a list", "ignored": "x"}); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadSettings()
	if err != nil || len(got.Words) != 0 {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
	if err := s.SaveSettings(Settings{Words: []string{"ok"}}); err != nil {
		t.Errorf("saving over unusable values: %v", err)
	}
}

func TestSettingsWithoutDataFolder(t *testing.T) {
	s := &SettingsService{db: newDatabase("")}
	if got, err := s.LoadSettings(); err != nil || len(got.Words) != 0 {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
	if err := s.SaveSettings(Settings{}); err == nil {
		t.Error("SaveSettings succeeded without a folder")
	}
}

func TestSettingsDamagedDatabaseStartsEmpty(t *testing.T) {
	s := newTestServices(t).Settings
	if err := os.MkdirAll(s.db.dir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(s.db.dir, "harper-pad.db"), []byte(strings.Repeat("junk ", 400)), 0o600); err != nil {
		t.Fatal(err)
	}
	if got, err := s.LoadSettings(); err != nil || len(got.Words) != 0 {
		t.Errorf("LoadSettings = %+v, %v", got, err)
	}
	if err := s.SaveSettings(Settings{Words: []string{"fresh"}}); err != nil {
		t.Errorf("saving after recovery: %v", err)
	}
}

func TestSettingsIgnoredLabels(t *testing.T) {
	s := newTestServices(t).Settings
	long := strings.Repeat("é", maxLabelRunes+20)
	in := Settings{IgnoredLabels: map[string]string{"18446744073709551615": "teh (Spelling)", "7": long}}
	if err := s.SaveSettings(in); err != nil {
		t.Fatal(err)
	}
	got, err := s.LoadSettings()
	if err != nil {
		t.Fatal(err)
	}
	if got.IgnoredLabels["18446744073709551615"] != "teh (Spelling)" {
		t.Errorf("LoadSettings = %+v", got)
	}
	if n := len([]rune(got.IgnoredLabels["7"])); n != maxLabelRunes {
		t.Errorf("a long label was kept at %d characters, want %d", n, maxLabelRunes)
	}
}
