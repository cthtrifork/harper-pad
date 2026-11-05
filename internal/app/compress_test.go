package app

import (
	"compress/gzip"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const jsBody = "export const answer = 42;\n"

func assetHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/app.js":
			w.Header().Set("Content-Type", "text/javascript; charset=utf-8")
			w.Header().Set("Content-Length", "26")
			_, _ = io.WriteString(w, strings.Repeat(jsBody, 200))
		case "/engine.wasm":
			w.Header().Set("Content-Type", "application/wasm")
			_, _ = io.WriteString(w, "\x00asm")
		case "/notmodified.js":
			w.Header().Set("Content-Type", "text/javascript")
			w.WriteHeader(http.StatusNotModified)
		case "/gone":
			http.NotFound(w, r)
		default:
			w.Header().Set("Content-Type", "text/html")
			_, _ = io.WriteString(w, "<p>hi</p>")
		}
	})
}

func get(t *testing.T, method, path string, header map[string]string) *http.Response {
	t.Helper()
	req := httptest.NewRequest(method, path, nil)
	for k, v := range header {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	gzipText(assetHandler()).ServeHTTP(rec, req)
	return rec.Result()
}

func body(t *testing.T, res *http.Response) string {
	t.Helper()
	var r io.Reader = res.Body
	if res.Header.Get("Content-Encoding") == "gzip" {
		gz, err := gzip.NewReader(res.Body)
		if err != nil {
			t.Fatalf("not gzip: %v", err)
		}
		r = gz
	}
	b, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return string(b)
}

func TestScriptIsCompressedForGzipClients(t *testing.T) {
	res := get(t, http.MethodGet, "/app.js", map[string]string{"Accept-Encoding": "gzip, deflate, br"})
	if res.Header.Get("Content-Encoding") != "gzip" {
		t.Fatalf("Content-Encoding = %q, want gzip", res.Header.Get("Content-Encoding"))
	}
	if res.Header.Get("Content-Length") != "" {
		t.Errorf("Content-Length %q must be dropped: the compressed length is unknown", res.Header.Get("Content-Length"))
	}
	if got := body(t, res); got != strings.Repeat(jsBody, 200) {
		t.Errorf("decompressed body differs (%d bytes)", len(got))
	}
}

func TestVaryIsSetEvenWhenNotCompressing(t *testing.T) {
	for _, h := range []map[string]string{nil, {"Accept-Encoding": "gzip"}} {
		res := get(t, http.MethodGet, "/engine.wasm", h)
		if res.Header.Get("Vary") != "Accept-Encoding" {
			t.Errorf("Vary = %q with %v", res.Header.Get("Vary"), h)
		}
	}
}

func TestLeftAlone(t *testing.T) {
	cases := map[string]struct {
		method, path string
		header       map[string]string
	}{
		"client without gzip":   {http.MethodGet, "/app.js", nil},
		"gzip refused with q=0": {http.MethodGet, "/app.js", map[string]string{"Accept-Encoding": "gzip;q=0"}},
		"range request":         {http.MethodGet, "/app.js", map[string]string{"Accept-Encoding": "gzip", "Range": "bytes=0-9"}},
		"wasm":                  {http.MethodGet, "/engine.wasm", map[string]string{"Accept-Encoding": "gzip"}},
		"not modified":          {http.MethodGet, "/notmodified.js", map[string]string{"Accept-Encoding": "gzip"}},
		"HEAD":                  {http.MethodHead, "/app.js", map[string]string{"Accept-Encoding": "gzip"}},
	}
	for name, c := range cases {
		t.Run(name, func(t *testing.T) {
			res := get(t, c.method, c.path, c.header)
			if enc := res.Header.Get("Content-Encoding"); enc != "" {
				t.Errorf("Content-Encoding = %q, want none", enc)
			}
		})
	}
}

func TestHTMLAndErrorsAreCompressedAndKeepTheirStatus(t *testing.T) {
	res := get(t, http.MethodGet, "/", map[string]string{"Accept-Encoding": "gzip"})
	if res.Header.Get("Content-Encoding") != "gzip" || body(t, res) != "<p>hi</p>" {
		t.Errorf("html: encoding %q", res.Header.Get("Content-Encoding"))
	}
	res = get(t, http.MethodGet, "/gone", map[string]string{"Accept-Encoding": "gzip"})
	if res.StatusCode != http.StatusNotFound {
		t.Errorf("status = %d, want 404", res.StatusCode)
	}
}

func TestAcceptsGzip(t *testing.T) {
	for header, want := range map[string]bool{
		"": false, "gzip": true, "GZIP": true, "deflate, gzip;q=0.5": true, "br, deflate": false, "gzip;q=0": false, "gzip; q=0": false, "identity": false,
	} {
		r := httptest.NewRequest(http.MethodGet, "/", nil)
		r.Header.Set("Accept-Encoding", header)
		if got := acceptsGzip(r); got != want {
			t.Errorf("acceptsGzip(%q) = %v, want %v", header, got, want)
		}
	}
}

func TestServeAssetsCompressesOnlyTheHeadlessBuild(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/app.js", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	rec := httptest.NewRecorder()
	ServeAssets(assetHandler()).ServeHTTP(rec, req)
	got := rec.Result().Header.Get("Content-Encoding") == "gzip"
	if got != headless {
		t.Errorf("compressed = %v with headless = %v", got, headless)
	}
}
