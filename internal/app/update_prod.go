//go:build production

package app

// updateAPIBase is always api.github.com in a production build: letting the environment
// redirect where a program downloads its own replacement from would be a gift to attackers.
func updateAPIBase() string { return "" }
