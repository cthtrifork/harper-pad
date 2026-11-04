package metrics

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInstrumentLabelsByPatternNotPath(t *testing.T) {
	m := New("sync")
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusNoContent) })
	h := m.Instrument(mux)
	for _, path := range []string{"/healthz", "/nope/1", "/nope/2"} {
		h.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}

	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rec.Body.String()
	for _, want := range []string{
		`harper_pad_http_requests_total{app="sync",code="204",method="GET",route="GET /healthz"} 1`,
		`harper_pad_http_requests_total{app="sync",code="404",method="GET",route="unmatched"} 2`,
		"go_goroutines",
		"process_cpu_seconds_total",
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics lack %q", want)
		}
	}
	if strings.Contains(body, "/nope/") {
		t.Error("a request path leaked into a label")
	}
}
