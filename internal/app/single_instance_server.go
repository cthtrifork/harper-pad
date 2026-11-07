//go:build server

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// SingleInstance is off in the headless server build, which has no window to focus and is started several times by tests and screenshots.
func SingleInstance(func()) *application.SingleInstanceOptions { return nil }
