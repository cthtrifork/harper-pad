// Package app holds the Harper Pad application: the Wails services the frontend calls.
package app

import "github.com/wailsapp/wails/v3/pkg/application"

// Services is the set of Wails services the app registers. Each one is a binding the frontend calls (see
// frontend/bindings): PadService for the app itself, DraftService, SyncService, SettingsService and UpdateService for the rest.
type Services struct {
	Pad      *PadService
	Drafts   *DraftService
	Sync     *SyncService
	Settings *SettingsService
	Update   *UpdateService
}

// NewServices returns the services, keeping the database in the user's data folder. The drafts and the settings share it.
func NewServices() *Services { return newServices(newDatabase(dataDir())) }

func newServices(db *database) *Services {
	drafts := &DraftService{db: db}
	return &Services{
		Pad:      &PadService{drafts: drafts},
		Drafts:   drafts,
		Sync:     &SyncService{db: db},
		Settings: &SettingsService{db: db},
		Update:   &UpdateService{},
	}
}

// All returns the services in the form application.Options wants. DraftService closes the database when the app quits.
func (s *Services) All() []application.Service {
	return []application.Service{
		application.NewService(s.Pad),
		application.NewService(s.Drafts),
		application.NewService(s.Sync),
		application.NewService(s.Settings),
		application.NewService(s.Update),
	}
}

// PadService is the app-level binding: what the page needs to start, and the build's version.
type PadService struct {
	drafts *DraftService
}

// DemoMode returns the banner text when a development build runs in demo mode (HARPER_PAD_DEMO is set), and an empty string otherwise.
func (*PadService) DemoMode() string { return demoDetail() }

// Version reports the build version, so the frontend can show it.
func (*PadService) Version() string { return version }
