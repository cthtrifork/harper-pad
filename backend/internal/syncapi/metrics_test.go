package syncapi

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/metrics"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

// noStore knows no device, so it needs no database.
type noStore struct{ Store }

func (noStore) DeviceByToken(context.Context, []byte) (store.Device, error) {
	return store.Device{}, store.ErrUnknownToken
}

func TestMetricsCountAuthFailuresAndCORS(t *testing.T) {
	m := metrics.New("sync")
	v := auth.NewVerifier()
	t.Cleanup(v.Close)
	api := New(publicURL, []string{"https://app.example"}, noStore{}, v)
	api.Metrics = m.Sync()
	mux := http.NewServeMux()
	api.Register(mux)
	h := api.CORS(mux)

	// No Authorization header, then a bad proof with a token, and a request from an origin that is not allowed.
	do(h, "GET", "/docs", nil, nil)
	do(h, "GET", "/docs", nil, map[string]string{"Authorization": "DPoP tok", "DPoP": "garbage"})
	do(h, "GET", "/docs", nil, map[string]string{"Origin": "https://evil.example"})

	rec := httptest.NewRecorder()
	m.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/metrics", nil))
	body := rec.Body.String()
	for _, want := range []string{
		`harper_pad_auth_failures_total{app="sync",reason="missing_credentials"} 2`,
		`harper_pad_auth_failures_total{app="sync",reason="invalid_proof"} 1`,
		`harper_pad_cors_rejected_total{app="sync"} 1`,
	} {
		if !strings.Contains(body, want) {
			t.Errorf("metrics lack %q\n%s", want, body)
		}
	}
}
