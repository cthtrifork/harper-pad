package app

import (
	"strings"
	"testing"
)

// A build that does not identify as a release must never be able to replace itself:
// the updater would treat "dev" as older than every release (see selfupdate.Enabled).
func TestNonReleaseBuildsCannotUpdate(t *testing.T) {
	old := version
	t.Cleanup(func() { version = old })

	for _, v := range []string{"dev", "", "ci-0123456", "1.2.3", "latest"} {
		version = v
		s := &PadService{}
		InitUpdater(s, nil) // never reaches the updater, so no app is needed

		info := s.UpdateInfo()
		if info.Enabled || info.Reason == "" || info.Version != v {
			t.Errorf("version %q: %+v", v, info)
		}
		for name, err := range map[string]error{
			"CheckForUpdates": func() error { _, err := s.CheckForUpdates(); return err }(),
			"InstallUpdate":   s.InstallUpdate(),
			"RestartToUpdate": s.RestartToUpdate(),
		} {
			if err == nil || !strings.Contains(err.Error(), "development build") {
				t.Errorf("version %q: %s() = %v, want the reason it is disabled", v, name, err)
			}
		}
	}
}
