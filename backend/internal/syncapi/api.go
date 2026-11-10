package syncapi

import (
	"context"
	"crypto/subtle"
	"encoding/base64"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"unicode/utf8"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/metrics"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/adapters/humago"
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
	Enroll(ctx context.Context, inviteHash []byte, deviceID, deviceName, userAgent, keyThumbprint string, tokenHash []byte) error
	DeviceByToken(ctx context.Context, tokenHash []byte) (store.Device, error)
	ListDocs(ctx context.Context, clientID int64, after string, limit int) ([]store.DocState, error)
	GetDoc(ctx context.Context, clientID int64, id string) (store.Doc, error)
	PutDoc(ctx context.Context, clientID int64, id string, base store.DocBase, w store.DocWrite) (store.Doc, error)
	GetSetting(ctx context.Context, clientID int64) (store.Setting, error)
	PutSetting(ctx context.Context, clientID int64, base int64, w store.Setting) (store.Setting, error)
}

// API is the sync API: the routes, the CORS allowlist and the device authentication. The routes are registered with Huma, which
// serves them on the standard library's ServeMux and describes them in an OpenAPI document (docs/openapi.yaml, generated from
// these types by `make openapi` in backend/).
type API struct {
	// Version is the release shown as the document's version (info.version). Set it before Register; New defaults it to "dev".
	Version string
	// Metrics counts auth failures, enrollments, draft writes and rejected origins. Optional (nil is fine); set it before Register.
	Metrics   *metrics.SyncMetrics
	publicURL string
	origins   map[string]bool
	store     Store
	verifier  *auth.Verifier
	api       huma.API

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
	return &API{Version: "dev", publicURL: strings.TrimRight(publicURL, "/"), origins: set, store: st, verifier: v, logged: map[string]bool{}}
}

// config is Huma's configuration. Huma serves the documentation page at /api and the OpenAPI document at /openapi.json and
// /openapi.yaml; both are public, like /healthz, and describe only the routes. The default /docs is the draft list, so the page
// is moved. No schema routes and no `$schema` member in bodies: the document is self-contained.
func (a *API) config() huma.Config {
	cfg := huma.DefaultConfig("Harper Pad sync API", a.Version)
	cfg.DocsPath, cfg.OpenAPIPath, cfg.SchemasPath = "/api", "/openapi", ""
	cfg.DocsRenderer = huma.DocsRendererScalar // Huma's default, Stoplight Elements, has a fixed sidebar that fills a phone screen
	cfg.CreateHooks = nil
	cfg.Info.Description = "The optional sync service of Harper Pad (docs/sync.md). Every route needs a DPoP proof header; routes other " +
		"than /enroll also need `Authorization: DPoP <device token>`. The proof is a JWT signed with the device's key (RFC 9449 " +
		"section 4.2): `typ` `dpop+jwt`, `alg` `ES256`, the public key in the `jwk` header, and the claims `jti`, `htm`, `htu`, " +
		"`iat` and, with a token, `ath`. Credential failures are all the same 401 and say nothing about the cause."
	cfg.Info.Contact = &huma.Contact{Name: "Harper Pad", URL: "https://github.com/cthtrifork/harper-pad"}
	cfg.Info.License = &huma.License{Name: "Apache-2.0", Identifier: "Apache-2.0"}
	cfg.Tags = []*huma.Tag{
		{Name: "enrollment", Description: "Spend an invite from the admin UI and get a device token."},
		{Name: "drafts", Description: "List, read and write the drafts of an enrolled device."},
		{Name: "settings", Description: "The personal dictionary and the ignore list, one document; the last device to write wins."},
	}
	cfg.ExternalDocs = &huma.ExternalDocs{Description: "How the sync works (docs/sync.md)", URL: "https://github.com/cthtrifork/harper-pad/blob/main/docs/sync.md"}
	// Scalar's options (https://github.com/scalar/scalar/blob/main/documentation/configuration.md). Every route needs a DPoP proof
	// signed with a device key, which the page's "Test Request" cannot make, so it is hidden along with the client picker and
	// the dev tools; the schema list is noise for a phone.
	cfg.DocsRendererConfig = map[string]any{
		"theme":                 "default",
		"layout":                "modern",
		"darkMode":              true,
		"hideTestRequestButton": true,
		"hideClientButton":      true,
		"hideModels":            true,
		"showDeveloperTools":    "never",
		"defaultOpenAllTags":    true,
	}
	cfg.Servers = []*huma.Server{{URL: a.publicURL}}
	cfg.Components.SecuritySchemes = map[string]*huma.SecurityScheme{
		"DPoP": {
			Type: "apiKey", In: "header", Name: "Authorization",
			Description: "`Authorization: DPoP <device token>` together with a `DPoP` proof header made with the key the device enrolled with.",
		},
	}
	return cfg
}

// Register adds the routes to mux and returns nothing: Huma is reachable through Huma() for the tests and the generator.
func (a *API) Register(mux *http.ServeMux) {
	a.api = humago.New(mux, a.config())

	huma.Register(a.api, huma.Operation{
		OperationID:   "enroll",
		Method:        http.MethodPost,
		Path:          "/enroll",
		Summary:       "Enroll a device",
		Description:   "Spends an invite from the admin UI and issues a device token bound to the key in the DPoP proof. The proof is checked before the body is read. A wrong, spent or expired invite, a bad or replayed proof and a missing proof are all the same 401.",
		Tags:          []string{"enrollment"},
		MaxBodyBytes:  maxEnrollBody,
		DefaultStatus: http.StatusOK,
		Errors:        []int{http.StatusBadRequest, http.StatusUnauthorized, http.StatusRequestEntityTooLarge},
		Middlewares:   huma.Middlewares{a.requireProof},
	}, a.enroll)

	a.registerDocs()
	a.registerSettings()

	// The root shows the documentation page (Huma serves it at /api).
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/api", http.StatusFound)
	})
}

// Huma returns the Huma API the routes are registered on, after Register.
func (a *API) Huma() huma.API { return a.api }

// CORS wraps the whole mux. It passes the request on unchanged (the metrics middleware reads the mux's pattern from the same
// *http.Request). An origin that is not on the allowlist gets no CORS headers, so the browser blocks the response, and it is logged
// once: the log line is how the origin of a new client (a desktop webview) is found.
func (a *API) CORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff") // also on the documentation page, which ZAP flags without it
		origin := r.Header.Get("Origin")
		if origin == "" {
			next.ServeHTTP(w, r)
			return
		}
		w.Header().Add("Vary", "Origin")
		allowed := a.origins[origin]
		if !allowed {
			a.Metrics.CORSRejected()
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

type enrollInput struct {
	// The header is described here and checked by the middleware, which runs before Huma validates the input: a `required` tag
	// would make a missing proof a 422 that differs from every other credential failure.
	DPoP      string `header:"DPoP" doc:"DPoP proof signed by the new key (its public key is in the proof's jwk header)"`
	UserAgent string `header:"User-Agent" doc:"Stored with the device, at most 200 characters"`
	Body      struct {
		Invite     string `json:"invite" doc:"The invite token from the enrollment URL fragment: 43 characters of base64url"`
		DeviceName string `json:"deviceName,omitempty" maxLength:"64" doc:"Used only when the invite carries no name"`
	}
}

type enrollOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         struct {
		DeviceToken string `json:"deviceToken" doc:"256 random bits, base64url. Send it as Authorization: DPoP <token>"`
		TokenType   string `json:"token_type" enum:"DPoP"`
	}
}

// ctxKey keys the values the middleware puts in the request context.
type ctxKey int

const (
	proofKey ctxKey = iota
	deviceKey
)

// DeviceFrom returns the device that RequireDevice authenticated. The account is its ClientID and is never taken from the request.
func DeviceFrom(ctx context.Context) (store.Device, bool) {
	d, ok := ctx.Value(deviceKey).(store.Device)
	return d, ok
}

// requireProof is the middleware of /enroll: it checks the DPoP proof before Huma reads or validates the body, so nothing is
// learned about the request's shape without a valid proof.
func (a *API) requireProof(ctx huma.Context, next func(huma.Context)) {
	proof, err := a.verifyProof(ctx, "")
	if err != nil {
		a.Metrics.AuthFailure(metrics.AuthInvalidProof)
		a.unauthorized(ctx)
		return
	}
	next(huma.WithValue(ctx, proofKey, proof))
}

// RequireDevice is the middleware of every route that needs an enrolled device: it checks the Authorization header and the DPoP
// proof, finds the device by the token and requires the proof's key to be the key the device enrolled with. The handler reads the
// device with DeviceFrom.
func (a *API) RequireDevice(ctx huma.Context, next func(huma.Context)) {
	scheme, token, ok := strings.Cut(ctx.Header("Authorization"), " ")
	if !ok || scheme != "DPoP" || token == "" || len(token) > 128 {
		a.Metrics.AuthFailure(metrics.AuthMissing)
		a.unauthorized(ctx)
		return
	}
	proof, err := a.verifyProof(ctx, token)
	if err != nil {
		a.Metrics.AuthFailure(metrics.AuthInvalidProof)
		a.unauthorized(ctx)
		return
	}
	dev, err := a.store.DeviceByToken(ctx.Context(), auth.HashToken(token))
	switch {
	case errors.Is(err, store.ErrUnknownToken):
		a.Metrics.AuthFailure(metrics.AuthUnknownToken)
		a.unauthorized(ctx)
		return
	case err != nil:
		slog.Error("sync api", "what", "device lookup", "err", err)
		_ = huma.WriteErr(a.api, ctx, http.StatusInternalServerError, "internal error")
		return
	}
	// The token alone is not enough: the proof must come from the key the device enrolled with.
	if subtle.ConstantTimeCompare([]byte(proof.KeyThumbprint), []byte(dev.KeyThumbprint)) != 1 {
		a.Metrics.AuthFailure(metrics.AuthKeyMismatch)
		a.unauthorized(ctx)
		return
	}
	next(huma.WithValue(ctx, deviceKey, dev))
}

// verifyProof checks the request's single DPoP header against its method and URL (from configuration, not from headers).
func (a *API) verifyProof(ctx huma.Context, token string) (auth.Proof, error) {
	// Exactly one proof (RFC 9449 section 4.3): Header() would return only the first of several, so count them.
	n := 0
	ctx.EachHeader(func(name, _ string) {
		if strings.EqualFold(name, "DPoP") {
			n++
		}
	})
	if n != 1 {
		return auth.Proof{}, auth.ErrInvalidProof
	}
	return a.verifier.Verify(ctx.Header("DPoP"), ctx.Method(), a.publicURL+ctx.URL().Path, token)
}

func (a *API) unauthorized(ctx huma.Context) {
	_ = huma.WriteErr(a.api, ctx, http.StatusUnauthorized, "unauthorized")
}

// enroll spends an invite and issues a device token bound to the key in the request's DPoP proof (docs/sync.md, "Enrollment").
func (a *API) enroll(ctx context.Context, in *enrollInput) (*enrollOutput, error) {
	proof, _ := ctx.Value(proofKey).(auth.Proof)
	name, ok := cleanName(in.Body.DeviceName)
	if !ok {
		a.Metrics.Enrollment(metrics.EnrollBadName)
		return nil, huma.Error422UnprocessableEntity("bad device name")
	}
	// An invite is 256 random bits in base64url; anything else cannot be one, and need not reach the database. It is the same 401
	// as a wrong invite: the shape of a token is not something to tell apart.
	if raw, err := base64.RawURLEncoding.DecodeString(in.Body.Invite); err != nil || len(raw) != 32 {
		a.Metrics.Enrollment(metrics.EnrollInvalid)
		return nil, huma.Error401Unauthorized("unauthorized")
	}
	token, err := auth.NewToken()
	if err != nil {
		return nil, serverError("token", err)
	}
	id, err := auth.NewID()
	if err != nil {
		return nil, serverError("id", err)
	}
	err = a.store.Enroll(ctx, auth.HashToken(in.Body.Invite), id, name, userAgent(in.UserAgent), proof.KeyThumbprint, auth.HashToken(token))
	switch {
	case errors.Is(err, store.ErrInvalidInvite):
		a.Metrics.Enrollment(metrics.EnrollInvalid)
		return nil, huma.Error401Unauthorized("unauthorized")
	case err != nil:
		a.Metrics.Enrollment(metrics.EnrollError)
		return nil, serverError("enroll", err)
	}
	a.Metrics.Enrollment(metrics.EnrollOK)
	out := &enrollOutput{CacheControl: "no-store"}
	out.Body.DeviceToken, out.Body.TokenType = token, "DPoP"
	return out, nil
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

func userAgent(ua string) string {
	ua = strings.ToValidUTF8(ua, "")
	if len(ua) > maxUserAgent {
		ua = strings.ToValidUTF8(ua[:maxUserAgent], "")
	}
	return ua
}

// serverError logs the cause and returns an error with no detail for the client.
func serverError(what string, err error) error {
	slog.Error("sync api", "what", what, "err", err)
	return huma.Error500InternalServerError("internal error")
}
