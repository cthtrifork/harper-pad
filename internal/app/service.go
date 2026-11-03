// Package app holds the Harper Pad application: the Wails service the frontend calls.
package app

import (
	"sync"

	"github.com/cthtrifork/harper-pad/internal/store"
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PadService is the Wails binding the frontend calls.
type PadService struct {
	app    *application.App
	update UpdateInfo

	dataDir string       // where the database lives (see dataDir); empty when the user's data folder is unknown
	smu     sync.Mutex   // guards store
	store   *store.Store // the database, opened on first use
}

// NewPadService returns the service, keeping its database in the user's data folder.
func NewPadService() *PadService { return &PadService{dataDir: dataDir()} }

// DemoMode returns the banner text when a development build runs in demo mode (HARPER_PAD_DEMO is set), and an empty string otherwise.
func (*PadService) DemoMode() string { return demoDetail() }

// Version reports the build version, so the frontend can show it.
func (*PadService) Version() string { return version }
