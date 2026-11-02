//go:build !linux || server

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// AddTray is a no-op: only the Linux desktop build has a tray icon.
func AddTray(*application.App, application.Window) {}
