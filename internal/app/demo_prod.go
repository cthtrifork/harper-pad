//go:build production

package app

// demoDetail is always empty in a production build: there is no demo mode.
func demoDetail() string { return "" }

// demoSaveDir is always empty in a production build.
func demoSaveDir() string { return "" }
