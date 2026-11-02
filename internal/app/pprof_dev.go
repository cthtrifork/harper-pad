//go:build pprof

package app

import (
	"log"
	"net"
	"net/http"
	"net/http/pprof"
	"os"
)

// pprofAddrEnv overrides the listen address of the profiling endpoint.
const pprofAddrEnv = "HARPER_PAD_PPROF_ADDR"

// defaultPprofAddr is loopback only: the endpoint is unauthenticated.
const defaultPprofAddr = "127.0.0.1:6060"

// init starts Go's pprof HTTP endpoint (docs/pprof.md). It is compiled in only with the pprof
// build tag, which pprof_guard.go refuses to combine with production, so a release binary never
// has it. It uses its own mux, not http.DefaultServeMux, so nothing else shares the listener.
func init() {
	addr := os.Getenv(pprofAddrEnv)
	if addr == "" {
		addr = defaultPprofAddr
	}
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		log.Fatalf("pprof: bad %s %q: %v", pprofAddrEnv, addr, err)
	}
	if ip := net.ParseIP(host); host != "localhost" && (ip == nil || !ip.IsLoopback()) {
		log.Fatalf("pprof: %s must be a loopback address, got %q", pprofAddrEnv, addr)
	}
	ln, err := net.Listen("tcp", addr)
	if err != nil {
		log.Fatalf("pprof: %v", err)
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)
	log.Printf("pprof endpoint started url=http://%s/debug/pprof/", ln.Addr())
	go func() { log.Print(http.Serve(ln, mux)) }()
}
