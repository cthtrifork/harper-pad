// Package app holds the Harper Pad application: the Wails service the frontend calls.
package app

import (
	"strings"
	"sync"

	"github.com/wailsapp/wails/v3/pkg/application"
)

// PadService is the Wails binding the frontend calls.
type PadService struct {
	app    *application.App
	update UpdateInfo

	dir string     // where settings are kept (see settingsDir); empty when the config folder is unknown
	mu  sync.Mutex // serialises reads and writes of the settings file
}

// NewPadService returns the service, keeping its files in the user's config folder.
func NewPadService() *PadService { return &PadService{dir: settingsDir()} }

// Version reports the build version, so the frontend can show it.
func (*PadService) Version() string { return version }

// Echo returns its argument trimmed; the spike uses it to prove the Go bridge works next to harper.js.
func (*PadService) Echo(text string) string { return strings.TrimSpace(text) }
