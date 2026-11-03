package main

import (
	"embed"
	"io/fs"
	"log"

	"github.com/cthtrifork/harper-pad/internal/app"
	"github.com/wailsapp/wails/v3/pkg/application"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	frontend, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		log.Fatal(err)
	}

	svc := app.NewPadService()
	wails := application.New(application.Options{
		Name:        "Harper Pad",
		Icon:        app.WindowIcon,
		Description: "Grammar-checked editor with a scratch pad drawer (" + app.Version() + ")",
		Services:    []application.Service{application.NewService(svc)},
		Assets:      application.AssetOptions{Handler: application.AssetFileServerFS(frontend)},
		// Linux: GTK4 reports the application id as the window's Wayland app_id and X11 class, and
		// KDE/GNOME match it to the .desktop file of the same name (the launcher icon and grouping).
		// Keep it equal to the desktop file name and its StartupWMClass in build/linux.
		Linux: application.LinuxOptions{ApplicationID: "io.github.cthtrifork.harper-pad", ProgramName: "io.github.cthtrifork.harper-pad"},
	})

	// After New (an update restart re-launches this binary and New diverts it into the swap
	// helper) and before Run, as the Wails self-update tutorial prescribes.
	app.InitUpdater(svc, wails)

	// Match the page's --bg (frontend/src/styles/index.css) so a dark system does not flash white before the page loads.
	background := application.NewRGB(0xf6, 0xf7, 0xf9)
	if wails.Env.IsDarkMode() {
		background = application.NewRGB(0x12, 0x16, 0x1b)
	}

	window := wails.Window.NewWithOptions(application.WebviewWindowOptions{
		Title:            "Harper Pad",
		Width:            1100,
		Height:           760,
		MinWidth:         600,
		MinHeight:        400,
		BackgroundColour: background,
		URL:              "/",
		Linux:            application.LinuxWindow{Icon: app.WindowIcon},
	})

	app.AddTray(wails, window)

	if err := wails.Run(); err != nil {
		log.Fatal(err)
	}
}
