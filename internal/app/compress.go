package app

import (
	"compress/gzip"
	"net/http"
	"strconv"
	"strings"
)

// ServeAssets is the handler for the embedded frontend. The headless server build (a browser talking to it over a network, and the
// build Lighthouse audits) answers with gzip, as every static host does (GitHub Pages included): the page is about 820 KB of JavaScript
// and CSS, and an uncompressed copy is what Lighthouse's simulated slow phone downloads before the first paint (a score of 68 against
// 94 for the same bytes compressed). The native window loads its assets from memory, where compressing only costs CPU, so it gets the
// handler unchanged.
func ServeAssets(h http.Handler) http.Handler {
	if !headless {
		return h
	}
	return gzipText(h)
}

// compressible says whether a Content-Type is worth compressing: text, scripts, JSON, SVG and XML. Fonts and the wasm are not (woff2 is
// compressed already, and the 20 MB wasm would cost a second of CPU for every request).
func compressible(contentType string) bool {
	ct := strings.ToLower(contentType)
	return strings.HasPrefix(ct, "text/") ||
		strings.Contains(ct, "javascript") ||
		strings.Contains(ct, "json") ||
		strings.Contains(ct, "svg") ||
		strings.Contains(ct, "xml")
}

// gzipText compresses the text responses of h for clients that accept gzip. It leaves alone Range requests (the partial body would no
// longer match its offsets), HEAD requests, and responses that already have a Content-Encoding, no body (304, 204) or a type that is
// not worth compressing.
func gzipText(h http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Add("Vary", "Accept-Encoding")
		if r.Method != http.MethodGet || r.Header.Get("Range") != "" || !acceptsGzip(r) {
			h.ServeHTTP(w, r)
			return
		}
		gw := &gzipWriter{ResponseWriter: w}
		defer gw.close()
		h.ServeHTTP(gw, r)
	})
}

func acceptsGzip(r *http.Request) bool {
	for _, part := range strings.Split(r.Header.Get("Accept-Encoding"), ",") {
		name, params, _ := strings.Cut(strings.TrimSpace(part), ";")
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

// gzipWriter decides on the first write (or WriteHeader) whether to compress, once the handler has set the Content-Type.
type gzipWriter struct {
	http.ResponseWriter
	gz      *gzip.Writer
	decided bool
}

func (g *gzipWriter) decide(status int) {
	if g.decided {
		return
	}
	g.decided = true
	h := g.Header()
	if status == http.StatusNotModified || status == http.StatusNoContent || status < 200 ||
		h.Get("Content-Encoding") != "" || !compressible(h.Get("Content-Type")) {
		return
	}
	h.Set("Content-Encoding", "gzip")
	h.Del("Content-Length") // the compressed length is not known yet
	g.gz = gzip.NewWriter(g.ResponseWriter)
}

func (g *gzipWriter) WriteHeader(status int) {
	g.decide(status)
	g.ResponseWriter.WriteHeader(status)
}

func (g *gzipWriter) Write(p []byte) (int, error) {
	g.decide(http.StatusOK)
	if g.gz != nil {
		return g.gz.Write(p)
	}
	return g.ResponseWriter.Write(p)
}

func (g *gzipWriter) close() {
	if g.gz != nil {
		_ = g.gz.Close()
	}
}

// Flush lets streaming responses through; the compressed bytes are flushed first.
func (g *gzipWriter) Flush() {
	if g.gz != nil {
		_ = g.gz.Flush()
	}
	if f, ok := g.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}
