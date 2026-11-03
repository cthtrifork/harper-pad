//go:build !production

package app

import "os"

// demoFlag switches a development build to demo mode.
const demoFlag = "HARPER_PAD_DEMO"

// demoDetail is the banner text when the demo flag is set, and empty otherwise. Demo mode makes the
// status bar's timings fixed so the screenshots are the same on every run. Production builds have no
// demo mode (demo_prod.go), and CI checks the release binary for this text.
func demoDetail() string {
	if os.Getenv(demoFlag) == "" {
		return ""
	}
	return "Demo mode (" + demoFlag + " is set): the timings in the status bar are fixed values."
}

// demoSaveFlag names a folder in which the headless demo saves files without a dialog (a server build cannot show one).
const demoSaveFlag = "HARPER_PAD_DEMO_SAVE_DIR"

// demoSaveDir is the folder "Save as file" writes to when the flag is set, and empty otherwise. Everything else is the real code:
// the file is written and the draft linked to it in the database. Production builds have no such folder (demo_prod.go).
func demoSaveDir() string { return os.Getenv(demoSaveFlag) }
