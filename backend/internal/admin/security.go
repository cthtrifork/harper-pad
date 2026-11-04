package admin

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"net/url"
)

const (
	csrfCookie = "hp_csrf"
	csrfHeader = "X-CSRF-Token" // htmx sends it (hx-headers on <body>)
	csrfField  = "csrf"         // plain forms send it
)

// contentSecurityPolicy has no inline script or style: htmx is configured not to inject its indicator style, and the pages carry
// no style attributes or handlers. frame-ancestors keeps the pages out of frames (clickjacking on Revoke).
const contentSecurityPolicy = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; " +
	"form-action 'self'; base-uri 'none'; frame-ancestors 'none'"

// protect adds the security headers to every response, makes sure the browser has a CSRF cookie, and rejects state-changing
// requests that are not same-origin or lack the token. Cloudflare's Access session is a cookie a page on another site could
// ride, so this is needed even though the app has no login of its own (docs/sync.md, "Login: Cloudflare Access with OIDC").
func protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", contentSecurityPolicy)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")

		token := ""
		if c, err := r.Cookie(csrfCookie); err == nil && validToken(c.Value) {
			token = c.Value
		}
		if token == "" {
			token = newToken()
			// Not Secure: the app sees plain HTTP behind the tunnel. SameSite=Strict and HttpOnly (the page gets the token
			// from the HTML, never from script).
			http.SetCookie(w, &http.Cookie{Name: csrfCookie, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode})
		}

		if !safeMethod(r.Method) {
			if !sameOrigin(r) {
				http.Error(w, "cross-origin request refused", http.StatusForbidden)
				return
			}
			sent := r.Header.Get(csrfHeader)
			if sent == "" {
				sent = r.PostFormValue(csrfField)
			}
			if subtle.ConstantTimeCompare([]byte(sent), []byte(token)) != 1 {
				http.Error(w, "missing or wrong CSRF token", http.StatusForbidden)
				return
			}
		}
		next.ServeHTTP(w, r.WithContext(withToken(r, token)))
	})
}

func safeMethod(m string) bool {
	return m == http.MethodGet || m == http.MethodHead || m == http.MethodOptions
}

// sameOrigin accepts a request the browser says is same-origin: Sec-Fetch-Site when present, else Origin compared with Host.
// A state-changing request with neither is refused (every current browser sends one of them).
func sameOrigin(r *http.Request) bool {
	if s := r.Header.Get("Sec-Fetch-Site"); s != "" {
		return s == "same-origin"
	}
	o := r.Header.Get("Origin")
	if o == "" {
		return false
	}
	u, err := url.Parse(o)
	return err == nil && u.Host != "" && u.Host == r.Host
}

func newToken() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err) // crypto/rand does not fail on supported platforms
	}
	return base64.RawURLEncoding.EncodeToString(b)
}

// validToken rejects cookie values we did not issue (wrong length or alphabet) so they are replaced rather than trusted.
func validToken(s string) bool {
	b, err := base64.RawURLEncoding.DecodeString(s)
	return err == nil && len(b) == 32
}
