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

func TestSyncMetrics(t *testing.T) {
	m := New("sync")
	s := m.Sync()
	s.AuthFailure(AuthUnknownToken)
	s.Enrollment(EnrollOK)
	s.DocWrite(WriteConflict)
	s.CORSRejected()
	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rec.Body.String()
	for _, want := range []string{
		`harper_pad_auth_failures_total{app="sync",reason="unknown_token"} 1`,
		`harper_pad_auth_failures_total{app="sync",reason="key_mismatch"} 0`,
		`harper_pad_enrollments_total{app="sync",outcome="ok"} 1`,
		`harper_pad_doc_writes_total{app="sync",outcome="conflict"} 1`,
		`harper_pad_cors_rejected_total{app="sync"} 1`,
		`harper_pad_last_doc_write_timestamp_seconds{app="sync"} 0`, // a conflict is not an accepted write
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics lack %q", want)
		}
	}
	s.DocWrite(WriteOK)
	rec = httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	if strings.Contains(rec.Body.String(), `harper_pad_last_doc_write_timestamp_seconds{app="sync"} 0`) {
		t.Error("an accepted write did not set the last-write time")
	}
}

func TestSyncMetricsNilIsSafe(t *testing.T) {
	var s *SyncMetrics
	s.AuthFailure(AuthMissing)
	s.Enrollment(EnrollOK)
	s.DocWrite(WriteOK)
	s.CORSRejected()
}
