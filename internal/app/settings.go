package app

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	settingsVersion = 1
	maxWords        = 10000   // personal dictionary size
	maxWordRunes    = 64      // one word
	maxIgnoredBytes = 1 << 20 // Harper's exported ignore list
)

// Settings is what the app remembers between runs: the personal dictionary and the findings the user chose to ignore.
// They are kept in the database (internal/store) as two settings, "words" (a JSON list) and "ignored".
type Settings struct {
	Version int `json:"version"`
	// Words is the personal dictionary: words Harper should not flag as misspelled.
	Words []string `json:"words"`
	// Ignored is Harper's own export of the ignored findings (a JSON list of hashes, not of the text), kept as it is.
	Ignored string `json:"ignored"`
}

// LoadSettings returns the saved settings, or empty ones when there are none yet. With no data folder it behaves
// like a first run. Unusable saved values are ignored (empty settings), so the app still starts; a database that
// cannot be opened (for example a newer one) is an error the UI shows.
func (s *PadService) LoadSettings() (Settings, error) {
	out := Settings{Version: settingsVersion, Words: []string{}}
	st, err := s.openStore()
	if errors.Is(err, errNoDataDir) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	saved, err := st.Settings()
	if err != nil {
		return out, err
	}
	var words []string
	if raw := saved["words"]; raw != "" {
		if err := json.Unmarshal([]byte(raw), &words); err != nil {
			return out, nil
		}
	}
	clean, err := sanitize(Settings{Words: words, Ignored: saved["ignored"]})
	if err != nil {
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
	st, err := s.openStore()
	if err != nil {
		return err
	}
	words, err := json.Marshal(clean.Words)
	if err != nil {
		return err
	}
	return st.SetSettings(map[string]string{"words": string(words), "ignored": clean.Ignored})
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
