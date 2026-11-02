//go:build !server

package app

// headless is false in the normal native-window build.
const headless = false
