// Package app holds the Harper Pad application: the Wails service the frontend calls.
package app

import "strings"

// version is stamped at build time: -ldflags "-X github.com/cthtrifork/harper-pad/internal/app.version=...".
var version = "dev"

// Version returns the build version.
func Version() string { return version }

// PadService is the Wails binding the frontend calls.
type PadService struct{}

// NewPadService returns the service.
func NewPadService() *PadService { return &PadService{} }

// Version reports the build version, so the frontend can show it.
func (*PadService) Version() string { return version }

// Echo returns its argument; the spike uses it to prove the Go bridge works next to harper.js.
func (*PadService) Echo(text string) string { return strings.TrimSpace(text) }
