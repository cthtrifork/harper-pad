package core

import (
	"encoding/json"
	"os"
	"testing"
)

// The cases in testdata/filename.json are the contract for both builds: this runs them against the Go code, and frontend/src/lib/core.test.js
// runs the same file against the compiled wasm.
func TestSuggestNameFixtures(t *testing.T) {
	raw, err := os.ReadFile("testdata/filename.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct{ Name, Title, Format, Want string }
	if err := json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	for _, c := range cases {
		t.Run(c.Name, func(t *testing.T) {
			if got := SuggestName(c.Title, c.Format); got != c.Want {
				t.Errorf("SuggestName(%q, %q) = %q, want %q", c.Title, c.Format, got, c.Want)
			}
		})
	}
}
