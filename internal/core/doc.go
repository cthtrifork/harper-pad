// Package core is the logic that the desktop app and the web (PWA) build must agree on exactly. It is plain Go with the standard
// library only: no SQLite, no Wails, no I/O. The desktop build calls it directly (through internal/store); the web build runs the same
// source compiled to WebAssembly (cmd/core-wasm, loaded by frontend/src/lib/core.js). See docs/wasm-core.md.
//
// Keep it pure and small: every exported function takes values and returns values, so it can cross the wasm boundary as JSON.
package core
