//go:build !server

package app

import "github.com/wailsapp/wails/v3/pkg/application"

// SingleInstance makes a second launch focus the window that is already open instead of starting another app (two instances would share
// the database and the files without knowing about each other). `focus` brings the existing window to the front. Desktop builds only.
func SingleInstance(focus func()) *application.SingleInstanceOptions {
	return &application.SingleInstanceOptions{
		UniqueID:               "io.github.cthtrifork.harper-pad",
		OnSecondInstanceLaunch: func(application.SecondInstanceData) { focus() },
	}
}
