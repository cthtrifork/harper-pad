package syncapi

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestJSONNotFound(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /ok", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })
	h := JSONNotFound(mux)

	for _, tc := range []struct {
		method, path string
		status       int
		ctype        string
	}{
		{"GET", "/", 404, "application/problem+json"},
		{"GET", "/nope", 404, "application/problem+json"},
		{"GET", "/ok", 200, ""},
		{"POST", "/ok", 405, "text/plain; charset=utf-8"},
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(tc.method, tc.path, nil))
		if rec.Code != tc.status {
			t.Errorf("%s %s: status %d, want %d", tc.method, tc.path, rec.Code, tc.status)
		}
		if tc.ctype != "" && rec.Header().Get("Content-Type") != tc.ctype {
			t.Errorf("%s %s: content type %q", tc.method, tc.path, rec.Header().Get("Content-Type"))
		}
		if tc.status == 404 && rec.Body.String() != notFoundBody {
			t.Errorf("%s %s: body %q", tc.method, tc.path, rec.Body.String())
		}
	}
}

func TestRootRedirectsToDocs(t *testing.T) {
	mux := http.NewServeMux()
	New("https://sync.example", nil, nil, nil).Register(mux)
	rec := httptest.NewRecorder()
	JSONNotFound(mux).ServeHTTP(rec, httptest.NewRequest("GET", "/", nil))
	if rec.Code != http.StatusFound || rec.Header().Get("Location") != "/api" {
		t.Fatalf("got %d %q", rec.Code, rec.Header().Get("Location"))
	}
	rec = httptest.NewRecorder()
	JSONNotFound(mux).ServeHTTP(rec, httptest.NewRequest("GET", "/api", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("/api: %d", rec.Code)
	}
}
