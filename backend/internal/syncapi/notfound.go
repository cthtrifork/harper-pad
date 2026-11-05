package syncapi

import (
	"net/http"
	"strconv"
)

const notFoundBody = `{"title":"Not Found","status":404,"detail":"No such route. See /docs."}` + "\n"

// JSONNotFound wraps mux so that a request no route matches gets a 404 in the API's own error format (application/problem+json)
// instead of net/http's plain "404 page not found". A 405 from the mux (known path, wrong method) passes through unchanged,
// with its Allow header.
func JSONNotFound(mux *http.ServeMux) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, pattern := mux.Handler(r); pattern != "" {
			mux.ServeHTTP(w, r)
			return
		}
		mux.ServeHTTP(&notFoundWriter{ResponseWriter: w}, r)
	})
}

// notFoundWriter swaps the body of the mux's default 404 and leaves any other status (405, redirects) alone.
type notFoundWriter struct {
	http.ResponseWriter
	replaced bool
}

func (n *notFoundWriter) WriteHeader(code int) {
	if code == http.StatusNotFound {
		n.replaced = true
		h := n.Header()
		h.Set("Content-Type", "application/problem+json")
		h.Del("X-Content-Type-Options")
		h.Set("Content-Length", strconv.Itoa(len(notFoundBody)))
		n.ResponseWriter.WriteHeader(code)
		_, _ = n.ResponseWriter.Write([]byte(notFoundBody))
		return
	}
	n.ResponseWriter.WriteHeader(code)
}

func (n *notFoundWriter) Write(b []byte) (int, error) {
	if n.replaced {
		return len(b), nil // the default body is dropped
	}
	return n.ResponseWriter.Write(b)
}
