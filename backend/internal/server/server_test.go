package server

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"syscall"
	"testing"
	"time"
)

type fakeDB struct{ err error }

func (f fakeDB) Ping(context.Context) error { return f.err }

func get(t *testing.T, h *Health, path string) *httptest.ResponseRecorder {
	t.Helper()
	mux := http.NewServeMux()
	h.Register(mux)
	rec := httptest.NewRecorder()
	mux.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	return rec
}

func TestHealthzDoesNotNeedTheDatabase(t *testing.T) {
	h := NewHealth(fakeDB{err: errors.New("down")})
	if got := get(t, h, "/healthz").Code; got != http.StatusOK {
		t.Fatalf("/healthz = %d, want 200", got)
	}
}

func TestReadyz(t *testing.T) {
	if got := get(t, NewHealth(fakeDB{}), "/readyz").Code; got != http.StatusOK {
		t.Fatalf("healthy db: /readyz = %d, want 200", got)
	}
	rec := get(t, NewHealth(fakeDB{err: errors.New("secret host")}), "/readyz")
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("db down: /readyz = %d, want 503", rec.Code)
	}
	if body := rec.Body.String(); body != "database unavailable\n" {
		t.Fatalf("body leaks the cause: %q", body)
	}
	h := NewHealth(fakeDB{})
	h.draining.Store(true)
	if got := get(t, h, "/readyz").Code; got != http.StatusServiceUnavailable {
		t.Fatalf("draining: /readyz = %d, want 503", got)
	}
}

type countingDB struct{ n int }

func (c *countingDB) Ping(context.Context) error { c.n++; return nil }

func TestReadyzCachesTheDatabaseCheck(t *testing.T) {
	db := &countingDB{}
	h := NewHealth(db)
	for range 5 {
		if got := get(t, h, "/readyz").Code; got != http.StatusOK {
			t.Fatalf("/readyz = %d", got)
		}
	}
	if db.n != 1 {
		t.Fatalf("database pinged %d times for 5 probes, want 1", db.n)
	}
	h.checkedAt = h.checkedAt.Add(-readyCacheTTL - time.Second)
	get(t, h, "/readyz")
	if db.n != 2 {
		t.Fatalf("expired cache: pinged %d times, want 2", db.n)
	}
}

func TestReadyzWhileStarting(t *testing.T) {
	h := NewHealth(fakeDB{})
	h.SetStarting(true)
	if rec := get(t, h, "/readyz"); rec.Code != http.StatusServiceUnavailable || rec.Body.String() != "starting\n" {
		t.Fatalf("starting: /readyz = %d %q, want 503 starting", rec.Code, rec.Body.String())
	}
	if got := get(t, h, "/healthz").Code; got != http.StatusOK {
		t.Fatalf("starting: /healthz = %d, want 200", got)
	}
	h.SetStarting(false)
	if got := get(t, h, "/readyz").Code; got != http.StatusOK {
		t.Fatalf("started: /readyz = %d, want 200", got)
	}
}

func freeAddr(t *testing.T) string {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = ln.Close() }()
	return ln.Addr().String()
}

func status(t *testing.T, addr, path string) int {
	t.Helper()
	for range 50 {
		resp, err := http.Get("http://" + addr + path)
		if err == nil {
			_ = resp.Body.Close()
			return resp.StatusCode
		}
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatalf("%s did not answer", addr)
	return 0
}

// TestRunServesProbesOnTheMetricsListener: with a metrics address the probes and /metrics are there and not on the public listener.
func TestRunServesProbesOnTheMetricsListener(t *testing.T) {
	old := shutdownDelay
	shutdownDelay = 0
	t.Cleanup(func() { shutdownDelay = old })
	public, ops := freeAddr(t), freeAddr(t)
	done := make(chan error, 1)
	go func() {
		done <- Run(public, http.NewServeMux(), NewHealth(fakeDB{}), ops, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			_, _ = w.Write([]byte("metrics"))
		}))
	}()
	for path, want := range map[string]int{"/healthz": 200, "/readyz": 200, "/metrics": 200} {
		if got := status(t, ops, path); got != want {
			t.Errorf("ops %s = %d, want %d", path, got, want)
		}
		if path != "/metrics" {
			if got := status(t, public, path); got != http.StatusNotFound {
				t.Errorf("public %s = %d, want 404", path, got)
			}
		}
	}
	if err := syscall.Kill(syscall.Getpid(), syscall.SIGTERM); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatalf("Run: %v", err)
	}
}
