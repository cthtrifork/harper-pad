package app

import (
	"context"
	"errors"
	"os"
	"strings"

	"github.com/cthtrifork/harper-pad/internal/selfupdate"
	"github.com/wailsapp/wails/v3/pkg/application"
	"github.com/wailsapp/wails/v3/pkg/updater"
)

// UpdateInfo tells the UI what this build can do about updates.
type UpdateInfo struct {
	Version string `json:"version"`
	Enabled bool   `json:"enabled"`
	// Reason says why updating is unavailable, for a tooltip. Empty when Enabled.
	Reason string `json:"reason"`
}

// InitUpdater enables in-app updates for release builds. Development builds, CI builds
// and headless server mode stay disabled: see selfupdate.Enabled for why a development
// build must never be allowed to "update" itself.
func InitUpdater(s *PadService, app *application.App) {
	s.app = app
	s.update = UpdateInfo{Version: version}
	switch {
	case !selfupdate.Enabled(version):
		s.update.Reason = "This is a development build; only released versions update themselves."
		return
	case headless:
		s.update.Reason = "The updater needs a native window, which headless server mode doesn't have."
		return
	}
	provider, err := selfupdate.NewProvider(updateAPIBase())
	if err == nil {
		err = app.Updater.Init(updater.Config{
			// The tutorial passes the version without the leading "v".
			CurrentVersion: strings.TrimPrefix(version, "v"),
			Providers:      []updater.Provider{provider},
			// The UI drives check, download and restart as separate clicks; the built-in
			// window would download as soon as a check finds a release.
			Window: updater.WindowNone,
		})
	}
	if err != nil {
		s.update.Reason = "Updates are unavailable: " + err.Error()
		return
	}
	s.update.Enabled = true
}

// UpdateInfo reports the running version and whether it can update itself.
func (s *PadService) UpdateInfo() UpdateInfo { return s.update }

// UpdateStatus is what a check found.
type UpdateStatus struct {
	Available bool   `json:"available"`
	Version   string `json:"version"`
	Notes     string `json:"notes"`
}

// CheckForUpdates asks GitHub Releases whether a newer release exists. It only looks:
// nothing is downloaded until InstallUpdate is called.
func (s *PadService) CheckForUpdates() (UpdateStatus, error) {
	if !s.update.Enabled {
		return UpdateStatus{}, errors.New(s.update.Reason)
	}
	rel, err := s.app.Updater.Check(context.Background())
	if err != nil || rel == nil {
		return UpdateStatus{}, err
	}
	return UpdateStatus{Available: true, Version: rel.Version, Notes: rel.Notes}, nil
}

// InstallUpdate downloads the release CheckForUpdates found, verifies its SHA-256 and
// stages it beside the running binary. It blocks until staged or failed, so it must be
// called from a binding (its own goroutine), never the UI thread.
func (s *PadService) InstallUpdate() error {
	if !s.update.Enabled {
		return errors.New(s.update.Reason)
	}
	// The new binary is staged beside the running one, which therefore must be writable.
	// Say so up front rather than failing after a download.
	if exe, err := os.Executable(); err == nil {
		if err := selfupdate.Installable(exe); err != nil {
			return err
		}
	}
	return s.app.Updater.DownloadAndInstall(context.Background())
}

// RestartToUpdate swaps the staged binary in and relaunches the app.
func (s *PadService) RestartToUpdate() error {
	if !s.update.Enabled {
		return errors.New(s.update.Reason)
	}
	return s.app.Updater.Restart(context.Background())
}

// version is stamped at release time: -ldflags "-X github.com/cthtrifork/harper-pad/internal/app.version=v1.2.3".
var version = "dev"

// Version is the stamped release version, or "dev" for an unstamped build.
func Version() string { return version }
