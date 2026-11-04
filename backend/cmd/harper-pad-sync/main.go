// Command harper-pad-sync is the sync API of Harper Pad (docs/sync.md).
//
// Scaffold: it only answers GET /healthz so the end-to-end stack can start. Enrollment, sync and the database come
// later, in the order given in the build order of docs/sync.md.
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
		addr = "127.0.0.1:8080"
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
	log.Printf("harper-pad-sync (scaffold) listening on %s", addr)
	log.Fatal(srv.ListenAndServe())
}
