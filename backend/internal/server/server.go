// Package server is what both commands share to run in Kubernetes: the health endpoints, a PostgreSQL readiness check and a
// graceful shutdown on SIGTERM.
//
//	GET /healthz  liveness: the process is up and serving. It never touches the database, so a database outage does not make the
//	              kubelet restart a healthy pod.
//	GET /readyz   readiness: a round trip to PostgreSQL (SELECT 1) succeeds, and the process is not shutting down. 503 otherwise.
package server

import (
	"context"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"os/signal"
	"sync/atomic"
	"syscall"
	"time"
)

// Pinger is the part of a database pool the readiness check needs (satisfied by *pgxpool.Pool).
type Pinger interface {
	Ping(ctx context.Context) error
}

const (
	pingTimeout     = 2 * time.Second // the probes should set timeoutSeconds above this
	shutdownTimeout = 20 * time.Second
	// shutdownDelay lets the endpoint controller and Traefik see the failing /readyz before the listener closes.
	shutdownDelay = 3 * time.Second
)

// Health serves the liveness and readiness endpoints.
type Health struct {
	db       Pinger
	draining atomic.Bool
}

// NewHealth returns a Health that checks db for readiness.
func NewHealth(db Pinger) *Health { return &Health{db: db} }

// Register adds GET /healthz and GET /readyz to mux.
func (h *Health) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		reply(w, http.StatusOK, "ok\n")
	})
	mux.HandleFunc("GET /readyz", h.ready)
}

func (h *Health) ready(w http.ResponseWriter, r *http.Request) {
	if h.draining.Load() {
		reply(w, http.StatusServiceUnavailable, "shutting down\n")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), pingTimeout)
	defer cancel()
	if err := h.db.Ping(ctx); err != nil {
		// The cause goes to the log, not to the client: it can name hosts and users.
		slog.Warn("readiness: database ping failed", "err", err)
		reply(w, http.StatusServiceUnavailable, "database unavailable\n")
		return
	}
	reply(w, http.StatusOK, "ok\n")
}

func reply(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

// Run serves handler on addr until SIGTERM or SIGINT, then marks the process not ready, waits shutdownDelay for the
// load balancers to notice, and drains in-flight requests for up to shutdownTimeout.
func Run(addr string, handler http.Handler, h *Health) error {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, syscall.SIGINT)
	defer stop()

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	srv := &http.Server{
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		IdleTimeout:       120 * time.Second,
	}
	errc := make(chan error, 1)
	go func() { errc <- srv.Serve(ln) }()
	slog.Info("listening", "addr", ln.Addr().String())

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	h.draining.Store(true)
	time.Sleep(shutdownDelay)
	sctx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()
	if err := srv.Shutdown(sctx); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}
