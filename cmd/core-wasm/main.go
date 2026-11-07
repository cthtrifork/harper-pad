//go:build wasip1

// Command core-wasm compiles internal/core to a WebAssembly module for the web build (docs/wasm-core.md).
//
// It is a WASI reactor: no main loop, just exported functions that the page calls after `_initialize`. The boundary is bytes in linear
// memory: the caller asks for a buffer with `core_alloc`, writes UTF-8 into it, calls a function with the buffer's address and length, and gets
// back one 64-bit value that packs the address (high half) and length (low half) of a JSON result, which it reads and hands back to `core_free`.
//
// Build: `npm run wasm` in frontend/ (scripts/build-wasm.mjs: TinyGo, from its container image).
package main

import (
	"encoding/json"
	"strings"
	"unsafe"

	"github.com/cthtrifork/harper-pad/internal/core"
)

// live keeps every buffer handed to the page reachable until it is freed, so Go's garbage collector cannot move or reclaim it.
var live = map[uintptr][]byte{}

func keep(b []byte) uintptr {
	if len(b) == 0 {
		b = make([]byte, 1)
	}
	p := uintptr(unsafe.Pointer(&b[0]))
	live[p] = b
	return p
}

//go:wasmexport core_alloc
func coreAlloc(n uint32) uint32 { return uint32(keep(make([]byte, n))) }

//go:wasmexport core_free
func coreFree(p uint32) { delete(live, uintptr(p)) }

// result packs a JSON-encoded value as address<<32 | length.
func result(v any) uint64 {
	out, err := json.Marshal(v)
	if err != nil {
		out = []byte(`null`)
	}
	return uint64(keep(out))<<32 | uint64(len(out))
}

func input(p, n uint32) string {
	b, ok := live[uintptr(p)]
	if !ok || uint32(len(b)) < n {
		return ""
	}
	return string(b[:n])
}

//go:wasmexport summarize
func summarize(p, n uint32) uint64 { return result(core.Summarize(input(p, n))) }

//go:wasmexport suggest_name
func suggestName(p, n uint32) uint64 { // the input is the format, a newline, then the title
	format, title, _ := strings.Cut(input(p, n), "\n")
	return result(core.SuggestName(title, format))
}

// main is required by the compiler and never runs in a reactor.
func main() {}
