package syncapi

import (
	"strings"
	"testing"
)

// TestDocsPageIsResponsive: the page uses Elements' responsive layout (the sidebar layout fills a phone screen) and carries a CSP.
func TestDocsPageIsResponsive(t *testing.T) {
	h, _ := setup(t, brokenStore{})
	rec := do(h, "GET", "/api", "", nil)
	if rec.Code != 200 {
		t.Fatalf("GET /api = %d", rec.Code)
	}
	for _, want := range []string{`layout="responsive"`, `name="viewport"`, `apiDescriptionUrl="/openapi.yaml"`} {
		if !strings.Contains(rec.Body.String(), want) {
			t.Errorf("page lacks %s", want)
		}
	}
	if rec.Header().Get("Content-Security-Policy") == "" {
		t.Error("no Content-Security-Policy")
	}
}
