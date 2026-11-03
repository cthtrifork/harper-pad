// Package app holds the Harper Pad application: the Wails service the frontend calls.
package app

import (
	"github.com/wailsapp/wails/v3/pkg/application"
)

// PadService is the Wails binding the frontend calls.
type PadService struct {
	app    *application.App
	update UpdateInfo
}

// NewPadService returns the service.
func NewPadService() *PadService { return &PadService{} }

// Version reports the build version, so the frontend can show it.
func (*PadService) Version() string { return version }
