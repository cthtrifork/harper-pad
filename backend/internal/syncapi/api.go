package syncapi

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

const (
	maxEnrollBody = 4 << 10 // an enrollment request is a few hundred bytes
	maxNameLen    = 64      // as in the admin UI
	maxUserAgent  = 200
	// maxLoggedOrigins bounds the set of rejected origins that are logged once each, so a client cannot fill the log or the map.
	maxLoggedOrigins = 64
)

// Store is what the handlers need from the database; *store.Sync implements it.
type Store interface {
	Enroll(ctx context.Context, inviteHash []byte, deviceID, deviceName, userAgent, publicKey string, tokenHash []byte) error
	DeviceByToken(ctx context.Context, tokenHash []byte) (store.Device, error)
}

// API is the sync API: the routes, the CORS allowlist and the device authentication.
type API struct {
	publicURL string
	origins   map[string]bool
	store     Store
	verifier  *auth.Verifier

	mu     sync.Mutex
	logged map[string]bool
}

// New returns the API. publicURL is the https origin clients use (PUBLIC_URL): the proof's htu is checked against it, never
// against the Host header. origins is the exact-match CORS allowlist.
func New(publicURL string, origins []string, st Store, v *auth.Verifier) *API {
	set := make(map[string]bool, len(origins))
	for _, o := range origins {
		set[o] = true
	}
	return &API{publicURL: strings.TrimRight(publicURL, "/"), origins: set, store: st, verifier: v, logged: map[string]bool{}}
}

// Register adds the routes to mux.
func (a *API) Register(mux *http.ServeMux) {
	mux.HandleFunc("POST /enroll", a.enroll)
}

// CORS wraps the whole mux. It passes the request on unchanged (the metrics middleware reads the mux's pattern from the same
// *http.Request). An origin that is not on the allowlist gets no CORS headers, so the browser blocks the response, and it is logged
// once: the log line is how the origin of a new client (a desktop webview) is found.
func (a *API) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Origin")
		allowed := a.origins[origin]
		if !allowed {
			a.logRejected(origin)
		} else {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
			if !allowed {
				w.WriteHeader(http.StatusForbidden)
				return
			}
			h := w.Header()
			h.Add("Vary", "Access-Control-Request-Method, Access-Control-Request-Headers")
			h.Set("Access-Control-Allow-Methods", "GET, POST, PUT")
			h.Set("Access-Control-Allow-Headers", "Authorization, DPoP, Content-Type, If-None-Match")
			h.Set("Access-Control-Max-Age", "600")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *API) logRejected(origin string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.logged[origin] || len(a.logged) >= maxLoggedOrigins {
		return
	}
	a.logged[origin] = true
	if len(origin) > 200 {
		origin = origin[:200]
	}
	slog.Warn("CORS: origin is not in CORS_ALLOWED_ORIGINS", "origin", origin)
}

type enrollRequest struct {
	Invite     string `json:"invite"`
	DeviceName string `json:"deviceName"`
}

type enrollResponse struct {
	DeviceToken string `json:"deviceToken"`
	TokenType   string `json:"token_type"`
}

// enroll spends an invite and issues a device token bound to the key in the request's DPoP proof (docs/sync.md, "Enrollment").
// Every failure that is about the credentials is the same 401: a wrong, spent or expired invite, a bad proof and a replayed one.
func (a *API) enroll(w http.ResponseWriter, r *http.Request) {
	proof, err := a.verifyProof(r, "")
	if err != nil {
		unauthorized(w)
		return
	}
	var req enrollRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxEnrollBody)).Decode(&req); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			reply(w, http.StatusRequestEntityTooLarge, "request too large\n")
			return
		}
		reply(w, http.StatusBadRequest, "bad request\n")
		return
	}
	name, ok := cleanName(req.DeviceName)
	if !ok {
		reply(w, http.StatusBadRequest, "bad device name\n")
		return
	}
	// An invite is 256 random bits in base64url; anything else cannot be one, and need not reach the database.
	if raw, err := base64.RawURLEncoding.DecodeString(req.Invite); err != nil || len(raw) != 32 {
		unauthorized(w)
		return
	}
	token, err := auth.NewToken()
	if err != nil {
		serverError(w, "token", err)
		return
	}
	id, err := auth.NewID()
	if err != nil {
		serverError(w, "id", err)
		return
	}
	err = a.store.Enroll(r.Context(), auth.HashToken(req.Invite), id, name, userAgent(r), proof.PublicKey, auth.HashToken(token))
	switch {
	case errors.Is(err, store.ErrInvalidInvite):
		unauthorized(w)
		return
	case err != nil:
		serverError(w, "enroll", err)
		return
	}
	writeJSON(w, http.StatusOK, enrollResponse{DeviceToken: token, TokenType: "DPoP"})
}

// Authenticated wraps a handler that needs a device: it checks the Authorization header and the DPoP proof, finds the device by
// the token and requires the proof's key to be the key the device enrolled with. The handler gets the device; the account is
// device.ClientID and is never taken from the request.
func (a *API) Authenticated(h func(http.ResponseWriter, *http.Request, store.Device)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
		if !ok || scheme != "DPoP" || token == "" || len(token) > 128 {
			unauthorized(w)
			return
		}
		proof, err := a.verifyProof(r, token)
		if err != nil {
			unauthorized(w)
			return
		}
		dev, err := a.store.DeviceByToken(r.Context(), auth.HashToken(token))
		switch {
		case errors.Is(err, store.ErrUnknownToken):
			unauthorized(w)
			return
		case err != nil:
			serverError(w, "device lookup", err)
			return
		}
		// The token alone is not enough: the proof must come from the key the device enrolled with.
		if subtle.ConstantTimeCompare([]byte(proof.PublicKey), []byte(dev.PublicKey)) != 1 {
			unauthorized(w)
			return
		}
		h(w, r, dev)
	}
}

// verifyProof checks the request's single DPoP header against its method and URL (from configuration, not from headers).
func (a *API) verifyProof(r *http.Request, token string) (auth.Proof, error) {
	vals := r.Header.Values("DPoP")
	if len(vals) != 1 {
		return auth.Proof{}, auth.ErrInvalidProof
	}
	return a.verifier.Verify(vals[0], r.Method, a.publicURL+r.URL.Path, token)
}

// cleanName trims a device name and checks it: valid UTF-8, no control characters, at most maxNameLen characters. Empty is fine
// here (the invite carries the name the operator typed); the store falls back to "Device" only if both are empty.
func cleanName(s string) (string, bool) {
	s = strings.TrimSpace(s)
	if !utf8.ValidString(s) || strings.ContainsFunc(s, func(r rune) bool { return r < ' ' || r == 0x7f }) || utf8.RuneCountInString(s) > maxNameLen {
		return "", false
	}
	return s, true
}

func userAgent(r *http.Request) string {
	ua := strings.ToValidUTF8(r.UserAgent(), "")
	if len(ua) > maxUserAgent {
		ua = strings.ToValidUTF8(ua[:maxUserAgent], "")
	}
	return ua
}

func unauthorized(w http.ResponseWriter) { reply(w, http.StatusUnauthorized, "unauthorized\n") }

func serverError(w http.ResponseWriter, what string, err error) {
	slog.Error("sync api", "what", what, "err", err)
	reply(w, http.StatusInternalServerError, "internal error\n")
}

func reply(w http.ResponseWriter, status int, body string) {
	w.Header().Set("Content-Type", "text/plain; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_, _ = w.Write([]byte(body))
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
