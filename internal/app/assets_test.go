package app

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

func assetHandler() http.Handler {
	fsys := fstest.MapFS{
		"index.html":    {Data: []byte("<!doctype html><title>x</title>" + strings.Repeat("a", 2000))},
		"assets/a-1.js": {Data: []byte(strings.Repeat("var a=1;", 500))},
		"logo.png":      {Data: []byte("\x89PNG\r\n\x1a\n" + strings.Repeat("x", 500))},
	}
	return assetMiddleware(http.FileServerFS(fsys), true)
}

func get(t *testing.T, path string, hdr map[string]string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, path, nil)
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	assetHandler().ServeHTTP(rec, req)
	return rec
}

func TestAssetMiddlewareGzipsText(t *testing.T) {
	rec := get(t, "/assets/a-1.js", map[string]string{"Accept-Encoding": "gzip, br"})
	if rec.Header().Get("Content-Encoding") != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", rec.Header().Get("Content-Encoding"))
	}
	if rec.Header().Get("Content-Length") != "" {
		t.Error("Content-Length must be dropped for a compressed body")
	}
	zr, err := gzip.NewReader(rec.Body)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(zr)
	if string(body) != strings.Repeat("var a=1;", 500) {
		t.Error("decompressed body differs from the file")
	}
}

func TestAssetMiddlewarePassThrough(t *testing.T) {
	for name, tc := range map[string]struct {
		path string
		hdr  map[string]string
	}{
		"no accept-encoding": {"/assets/a-1.js", nil},
		"binary":             {"/logo.png", map[string]string{"Accept-Encoding": "gzip"}},
		"range":              {"/assets/a-1.js", map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-9"}},
		"not found":          {"/missing.js", map[string]string{"Accept-Encoding": "gzip"}},
	} {
		t.Run(name, func(t *testing.T) {
			if enc := get(t, tc.path, tc.hdr).Header().Get("Content-Encoding"); enc != "" {
				t.Errorf("Content-Encoding = %q, want none", enc)
			}
		})
	}
}

func TestAssetMiddlewareCacheHeaders(t *testing.T) {
	if cc := get(t, "/assets/a-1.js", nil).Header().Get("Cache-Control"); !strings.Contains(cc, "immutable") {
		t.Errorf("hashed asset Cache-Control = %q, want immutable", cc)
	}
	if cc := get(t, "/index.html", nil).Header().Get("Cache-Control"); cc != "no-cache" {
		t.Errorf("index Cache-Control = %q, want no-cache", cc)
	}
}

func TestAssetMiddlewareLeavesOtherRequestsAlone(t *testing.T) {
	var sawWriter http.ResponseWriter
	h := assetMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sawWriter = w
		w.Header().Set("Content-Type", "text/event-stream")
		_, _ = w.Write([]byte("data: x\n\n"))
	}), true)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/wails/runtime", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	h.ServeHTTP(rec, req)
	if sawWriter != http.ResponseWriter(rec) || rec.Header().Get("Cache-Control") != "" {
		t.Error("a POST must reach the next handler untouched")
	}

	rec = httptest.NewRecorder()
	req = httptest.NewRequest(http.MethodGet, "/events", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Encoding") != "" {
		t.Error("an event stream must not be compressed")
	}
}

func TestAssetMiddlewareNativeWindowIsNotCompressed(t *testing.T) {
	h := assetMiddleware(http.FileServerFS(fstest.MapFS{
		"assets/a-1.js": {Data: []byte(strings.Repeat("var a=1;", 500))},
	}), false)
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/assets/a-1.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	h.ServeHTTP(rec, req)
	if rec.Header().Get("Content-Encoding") != "" {
		t.Error("the native window build must not compress")
	}
	if !strings.Contains(rec.Header().Get("Cache-Control"), "immutable") {
		t.Error("cache headers still apply without compression")
	}
}

func TestAcceptsGzip(t *testing.T) {
	for header, want := range map[string]bool{
		"": false, "gzip": true, "GZIP": true, "deflate, gzip;q=0.5": true, "br, deflate": false, "identity": false,
		"gzip;q=0": false, "gzip; q=0": false, "gzip;q=0.0": false, "gzip, br;q=0": true,
	} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Accept-Encoding", header)
		if got := acceptsGzip(r); got != want {
			t.Errorf("acceptsGzip(%q) = %v, want %v", header, got, want)
		}
	}
}
