package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"path/filepath"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/cthtrifork/harper-pad/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
)

const (
	settingsVersion = 1
	maxWords        = 10000   // personal dictionary size
	maxWordRunes    = 64      // one word
	maxIgnoredBytes = 1 << 20 // Harper's exported ignore list
)

// Settings is what the app remembers between runs: the personal dictionary and the findings the user chose to ignore.
type Settings struct {
	Version int `json:"version"`
	// Words is the personal dictionary: words Harper should not flag as misspelled.
	Words []string `json:"words"`
	// Ignored is Harper's own export of the ignored findings (a JSON list of hashes, not of the text), kept as it is.
	Ignored string `json:"ignored"`
}

// settingsDir is where settings.json lives: the user's config folder, in a folder named after the app.
// Linux: ~/.config/harper-pad (XDG_CONFIG_HOME); Windows: %LOCALAPPDATA%\harper-pad.
func settingsDir() string {
	base := application.Path(application.PathConfigHome)
	if base == "" {
		return ""
	}
	return filepath.Join(base, "harper-pad")
}

func (s *PadService) settingsFile() (string, error) {
	if s.dir == "" {
		return "", errors.New("the user's config folder could not be found, so settings cannot be saved")
	}
	return filepath.Join(s.dir, "settings.json"), nil
}

// LoadSettings returns the saved settings, or empty ones when there are none yet. A damaged file is moved aside
// (settings.json.bad) and empty settings are returned, so the app still starts.
func (s *PadService) LoadSettings() (Settings, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := Settings{Version: settingsVersion, Words: []string{}}
	path, err := s.settingsFile()
	if err != nil {
		return out, nil // nowhere to read from: behave like a first run
	}
	var saved Settings
	recovered, err := store.Load(path, &saved)
	if err != nil {
		return out, err
	}
	if recovered {
		log.Printf("settings: %s was not valid and was moved to %s.bad; starting with empty settings", path, path)
		return out, nil
	}
	clean, err := sanitize(saved)
	if err != nil {
		log.Printf("settings: ignoring the saved settings: %v", err)
		return out, nil
	}
	return clean, nil
}

// SaveSettings validates and saves the settings. The frontend sends the whole set after every change.
func (s *PadService) SaveSettings(in Settings) error {
	clean, err := sanitize(in)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	path, err := s.settingsFile()
	if err != nil {
		return err
	}
	return store.Save(path, &clean)
}

// sanitize trims and de-duplicates the words and rejects input that is too large or not what Harper exports.
func sanitize(in Settings) (Settings, error) {
	out := Settings{Version: settingsVersion, Words: []string{}}
	seen := make(map[string]bool, len(in.Words))
	for _, w := range in.Words {
		w = strings.TrimSpace(w)
		if w == "" || seen[w] {
			continue
		}
		if utf8.RuneCountInString(w) > maxWordRunes || strings.IndexFunc(w, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
			return Settings{}, fmt.Errorf("%q is not a single word of at most %d characters", w, maxWordRunes)
		}
		seen[w] = true
		out.Words = append(out.Words, w)
	}
	if len(out.Words) > maxWords {
		return Settings{}, fmt.Errorf("the dictionary has %d words; the limit is %d", len(out.Words), maxWords)
	}
	if len(in.Ignored) > maxIgnoredBytes {
		return Settings{}, fmt.Errorf("the ignore list is %d bytes; the limit is %d", len(in.Ignored), maxIgnoredBytes)
	}
	if in.Ignored != "" && !json.Valid([]byte(in.Ignored)) {
		return Settings{}, errors.New("the ignore list is not valid JSON")
	}
	out.Ignored = in.Ignored
	return out, nil
}
