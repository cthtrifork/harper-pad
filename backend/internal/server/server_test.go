package server

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
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
