package app

import _ "embed"

// WindowIcon is the app icon (the same art as frontend/public/favicon.svg), passed to Wails'
// application and window Icon options.
//
//go:embed window_icon.png
var WindowIcon []byte
