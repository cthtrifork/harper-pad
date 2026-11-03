//go:build !production

package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDemoMode(t *testing.T) {
	svc := NewPadService()
	t.Setenv(demoFlag, "")
	if got := svc.DemoMode(); got != "" {
		t.Errorf("DemoMode() = %q with the flag unset, want empty", got)
	}
	t.Setenv(demoFlag, "1")
	if got := svc.DemoMode(); got == "" {
		t.Error("DemoMode() is empty with the flag set")
	}
}

func TestDemoSaveDirReplacesTheDialog(t *testing.T) {
	dir := filepath.Join(t.TempDir(), "Documents")
	t.Setenv(demoSaveFlag, dir)
	got, err := pickSavePath("notes.md", "")
	if err != nil || got != filepath.Join(dir, "notes.md") {
		t.Fatalf("pickSavePath = %q, %v", got, err)
	}
	if fi, err := os.Stat(dir); err != nil || !fi.IsDir() {
		t.Errorf("the folder was not created: %v", err)
	}
}
