package store

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

// The web build's save (frontend/src/lib/webDrafts.js) runs the same cases.
func TestSaveValidationFixtures(t *testing.T) {
	raw, err := os.ReadFile("testdata/validate.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []struct {
		Name         string
		Format       string
		ContentBytes int
		ID           string
		Error        string
	}
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) == 0 {
		t.Fatal("no fixtures")
	}
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			s, _ := open(t)
			_, err := s.Save(Draft{ID: f.ID, Format: f.Format, Content: strings.Repeat("a", f.ContentBytes)})
			switch {
			case f.Error == "" && err != nil:
				t.Errorf("Save failed: %v", err)
			case f.Error != "" && (err == nil || !strings.Contains(err.Error(), f.Error)):
				t.Errorf("Save error = %v, want it to contain %q", err, f.Error)
			}
		})
	}
}
