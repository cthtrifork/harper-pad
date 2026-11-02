//go:build !production

package app

import "os"

// updateAPIBase lets a development build point the updater at another GitHub API
// (a local test server, or GitHub Enterprise). Production builds ignore it, so a
// release can only ever update from api.github.com.
func updateAPIBase() string { return os.Getenv("HARPER_PAD_UPDATE_API_URL") }
