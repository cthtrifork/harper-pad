// Command harper-pad-admin is the admin UI of Harper Pad: Go and HTMX, reached through a Cloudflare Tunnel behind
// Cloudflare Access (docs/sync.md, "The admin UI").
//
// Scaffold: it only answers GET /healthz. It listens on loopback by default because in the cluster only its
// cloudflared sidecar may reach it.
package main

import (
	"log"
	"net/http"
	"os"
	"time"
)

func main() {
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8081"
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok\n"))
	})

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}
	log.Printf("harper-pad-admin (scaffold) listening on %s", addr)
	log.Fatal(srv.ListenAndServe())
}
