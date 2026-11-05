package app

import (
	"compress/gzip"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// AssetMiddleware is the Wails AssetOptions.Middleware hook for what the embedded file server
// lacks: gzip for text assets (the bundle is hundreds of KB of JS) and cache headers. Vite
// content-hashes everything under /assets/, so those files are immutable; index.html must stay
// revalidated because it names the current hashes. Only plain GET/HEAD requests are touched:
// bound-method calls, websocket upgrades and event streams pass through unchanged.
//
// Compression is for the headless server only (a real HTTP browser). The native window is fed by
// the webview's asset scheme, where a Content-Encoding header may not be honoured, so it gets the
// bytes as they are.
func AssetMiddleware(next http.Handler) http.Handler { return assetMiddleware(next, headless) }

func assetMiddleware(next http.Handler, compress bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if (r.Method != http.MethodGet && r.Method != http.MethodHead) || r.Header.Get("Upgrade") != "" {
			next.ServeHTTP(w, r)
			return
		}
		switch {
		case strings.HasPrefix(r.URL.Path, "/assets/"):
			w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
		case r.URL.Path == "/" || r.URL.Path == "/index.html":
			w.Header().Set("Cache-Control", "no-cache")
		}
		// Range responses must stay byte-exact, so they are never compressed.
		if !compress || r.Header.Get("Range") != "" || !acceptsGzip(r) {
			next.ServeHTTP(w, r)
			return
		}
		gw := &gzipWriter{ResponseWriter: w}
		defer gw.close()
		next.ServeHTTP(gw, r)
	})
}

func acceptsGzip(r *http.Request) bool {
	for _, enc := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(enc), ";")
		if !strings.EqualFold(strings.TrimSpace(name), "gzip") {
			continue
		}
		// "gzip;q=0" refuses it; any other quality (q=0.5) accepts it.
		if q, ok := strings.CutPrefix(strings.ReplaceAll(strings.ToLower(params), " ", ""), "q="); ok {
			if v, err := strconv.ParseFloat(q, 64); err == nil && v == 0 {
				return false
			}
		}
		return true
	}
	return false
}

func compressible(contentType string) bool {
	ct, _, _ := strings.Cut(contentType, ";")
	ct = strings.TrimSpace(ct)
	return (strings.HasPrefix(ct, "text/") && ct != "text/event-stream") || ct == "application/json" ||
		ct == "image/svg+xml" || strings.Contains(ct, "javascript")
}

// gzipWriter decides on the first WriteHeader/Write, once the file server has set Content-Type,
// whether to compress; non-text and non-200 responses pass through untouched.
type gzipWriter struct {
	http.ResponseWriter
	gz      *gzip.Writer
	started bool
}

var gzipPool = sync.Pool{New: func() any { return gzip.NewWriter(nil) }}

func (g *gzipWriter) WriteHeader(status int) {
	if g.started {
		return
	}
	g.started = true
	h := g.Header()
	h.Add("Vary", "Accept-Encoding")
	if status == http.StatusOK && h.Get("Content-Encoding") == "" && compressible(h.Get("Content-Type")) {
		h.Set("Content-Encoding", "gzip")
		h.Del("Content-Length")
		g.gz = gzipPool.Get().(*gzip.Writer)
		g.gz.Reset(g.ResponseWriter)
	}
	g.ResponseWriter.WriteHeader(status)
}

func (g *gzipWriter) Write(p []byte) (int, error) {
	if !g.started {
		g.WriteHeader(http.StatusOK)
	}
	if g.gz != nil {
		return g.gz.Write(p)
	}
	return g.ResponseWriter.Write(p)
}

func (g *gzipWriter) close() {
	if g.gz != nil {
		_ = g.gz.Close()
		gzipPool.Put(g.gz)
	}
}

func (g *gzipWriter) Flush() {
	if g.gz != nil {
		_ = g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Unwrap lets http.ResponseController reach the underlying writer (flush, deadlines).
func (g *gzipWriter) Unwrap() http.ResponseWriter { return g.ResponseWriter }
