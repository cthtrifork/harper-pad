package store

import (
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

type doc struct {
	Name  string   `json:"name"`
	Words []string `json:"words"`
}

func TestSaveLoadRoundTrip(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sub", "dir", "doc.json")
	in := doc{Name: "x", Words: []string{"a", "ä", "😀"}}
	if err := Save(path, &in); err != nil {
		t.Fatal(err)
	}
	var out doc
	if rec, err := Load(path, &out); err != nil || rec {
		t.Fatalf("Load = recovered %v, err %v", rec, err)
	}
	if out.Name != in.Name || strings.Join(out.Words, ",") != strings.Join(in.Words, ",") {
		t.Errorf("round trip gave %+v, want %+v", out, in)
	}
}

func TestSaveLeavesNoTempFilesAndReplaces(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")
	for _, name := range []string{"one", "two", "three"} {
		if err := Save(path, &doc{Name: name}); err != nil {
			t.Fatal(err)
		}
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "doc.json" {
		t.Errorf("folder holds %v, want only doc.json", entries)
	}
	var out doc
	if _, err := Load(path, &out); err != nil || out.Name != "three" {
		t.Errorf("Load = %+v, %v; want the last write", out, err)
	}
}

func TestSavePermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix permission bits do not apply on Windows")
	}
	dir := filepath.Join(t.TempDir(), "private")
	path := filepath.Join(dir, "doc.json")
	if err := Save(path, &doc{}); err != nil {
		t.Fatal(err)
	}
	for p, want := range map[string]os.FileMode{dir: 0o700, path: 0o600} {
		info, err := os.Stat(p)
		if err != nil {
			t.Fatal(err)
		}
		if got := info.Mode().Perm(); got != want {
			t.Errorf("%s has mode %v, want %v", p, got, want)
		}
	}
}

func TestLoadMissingLeavesValue(t *testing.T) {
	out := doc{Name: "keep"}
	rec, err := Load(filepath.Join(t.TempDir(), "nope.json"), &out)
	if err != nil || rec || out.Name != "keep" {
		t.Errorf("Load = recovered %v, err %v, value %+v", rec, err, out)
	}
}

func TestLoadCorruptMovesAside(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "doc.json")
	if err := os.WriteFile(path, []byte(`{"name": "x", "words": [`), 0o600); err != nil {
		t.Fatal(err)
	}
	out := doc{Name: "default"}
	rec, err := Load(path, &out)
	if err != nil || !rec {
		t.Fatalf("Load = recovered %v, err %v; want recovered", rec, err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Errorf("the damaged file is still in place: %v", err)
	}
	if bad, err := os.ReadFile(path + ".bad"); err != nil || !strings.Contains(string(bad), `"words"`) {
		t.Errorf("the damaged file was not kept as .bad: %v", err)
	}
	if out.Name != "default" {
		t.Errorf("value changed to %+v", out)
	}
	// The next save starts clean.
	if err := Save(path, &doc{Name: "fresh"}); err != nil {
		t.Fatal(err)
	}
}
