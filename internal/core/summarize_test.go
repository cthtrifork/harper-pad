package core

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// The cases in testdata/summarize.json are the contract for both builds: this test runs them against the Go code, and
// frontend/src/lib/core.test.js runs the same file against the compiled wasm.
type summarizeFixture struct {
	Name string `json:"name"`
	// Content is the input; the rest is the expected Summary.
	Content string `json:"content"`
	Summary
}

func TestSummarizeFixtures(t *testing.T) {
	raw, err := os.ReadFile("testdata/summarize.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures []summarizeFixture
	if err := json.Unmarshal(raw, &fixtures); err != nil {
		t.Fatal(err)
	}
	if len(fixtures) == 0 {
		t.Fatal("no fixtures")
	}
	for _, f := range fixtures {
		t.Run(f.Name, func(t *testing.T) {
			if got := Summarize(f.Content); !reflect.DeepEqual(got, f.Summary) {
				t.Errorf("Summarize = %+v\nwant        %+v", got, f.Summary)
			}
		})
	}
}
