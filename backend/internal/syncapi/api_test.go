package syncapi

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/auth/authtest"
	"github.com/cthtrifork/harper-pad/backend/internal/pgtest"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
	"github.com/danielgtaylor/huma/v2"
)

const publicURL = "https://sync.example.org"

// newDB opens the stack's PostgreSQL as both roles, as the cluster does: harper_admin (the table owner) applies the migrations and
// makes invites, as the admin UI does; harper_sync (rows only) is the store behind the API. Each test starts with no devices or invites.
func newDB(t *testing.T) (*store.Admin, *store.Sync) {
	t.Helper()
	ctx := context.Background()
	pgtest.Login(t, "harper_admin", "admin")
	adminPool, err := store.Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(adminPool.Close)
	if _, err := store.Migrate(ctx, adminPool, store.Migrations); err != nil {
		t.Fatal(err)
	}
	if _, err := adminPool.Exec(ctx, `TRUNCATE devices, invites, docs, settings`); err != nil {
		t.Fatal(err)
	}
	pgtest.Login(t, "harper_sync", "client")
	syncPool, err := store.Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(syncPool.Close)
	return store.NewAdmin(adminPool), store.NewSync(syncPool)
}

// makeInvite makes an enrollment token for a device with that name ("" lets the device choose).
func makeInvite(t *testing.T, a *store.Admin, name string) string {
	t.Helper()
	token, _, err := a.CreateInvite(context.Background(), name, 15*time.Minute)
	if err != nil {
		t.Fatal(err)
	}
	return token
}

// brokenStore is a Store whose every call fails, for the paths that must not reach the database or must hide its errors.
type brokenStore struct{ err error }

func (b brokenStore) Enroll(context.Context, []byte, string, string, string, string, []byte) error {
	return b.err
}

func (b brokenStore) DeviceByToken(context.Context, []byte) (store.Device, error) {
	return store.Device{}, b.err
}

func (b brokenStore) ListDocs(context.Context, int64, string, int) ([]store.DocState, error) {
	return nil, b.err
}

func (b brokenStore) GetDoc(context.Context, int64, string) (store.Doc, error) {
	return store.Doc{}, b.err
}

func (b brokenStore) PutDoc(context.Context, int64, string, store.DocBase, store.DocWrite) (store.Doc, error) {
	return store.Doc{}, b.err
}

func newInvite(t *testing.T) string {
	t.Helper()
	tok, err := auth.NewToken()
	if err != nil {
		t.Fatal(err)
	}
	return tok
}

type whoamiIn struct {
	DPoP          string `header:"DPoP"`
	Authorization string `header:"Authorization"`
}

type whoamiOut struct {
	Body struct {
		ID string `json:"id"`
	}
}

func setup(t *testing.T, st Store, origins ...string) (http.Handler, *int) {
	t.Helper()
	v := auth.NewVerifier()
	t.Cleanup(v.Close)
	api := New(publicURL+"/", origins, st, v)
	mux := http.NewServeMux()
	api.Register(mux)
	hits := 0
	huma.Register(api.Huma(), huma.Operation{
		OperationID: "whoami", Method: http.MethodGet, Path: "/whoami", Middlewares: huma.Middlewares{api.RequireDevice},
	}, func(ctx context.Context, _ *whoamiIn) (*whoamiOut, error) {
		hits++
		d, _ := DeviceFrom(ctx)
		out := &whoamiOut{}
		out.Body.ID = d.ID
		return out, nil
	})
	return api.CORS(mux), &hits
}

func do(h http.Handler, method, path string, body any, hdr map[string]string) *httptest.ResponseRecorder {
	var rd *bytes.Reader
	if s, ok := body.(string); ok {
		rd = bytes.NewReader([]byte(s))
	} else {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req := httptest.NewRequest(method, path, rd)
	if rd.Len() > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

var jti atomic.Int64

func proof(t *testing.T, k authtest.Key, method, path, token string) string {
	t.Helper()
	c := authtest.Claims{JTI: "jti-" + strconv.FormatInt(jti.Add(1), 10), HTM: method, HTU: publicURL + path, IAT: time.Now().Unix()}
	if token != "" {
		c.ATH = authtest.ATH(token)
	}
	return k.Proof(t, nil, c)
}

func TestEnrollThenAuthenticate(t *testing.T) {
	admin, db := newDB(t)
	token := makeInvite(t, admin, "Kitchen iPad")
	h, hits := setup(t, db)
	k := authtest.NewKey(t)

	rec := do(h, "POST", "/enroll", map[string]string{"invite": token, "deviceName": "ignored"},
		map[string]string{"DPoP": proof(t, k, "POST", "/enroll", ""), "User-Agent": "Safari/1"})
	if rec.Code != 200 {
		t.Fatalf("enroll = %d %s", rec.Code, rec.Body)
	}
	var got struct {
		DeviceToken string `json:"deviceToken"`
		TokenType   string `json:"token_type"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil || got.TokenType != "DPoP" || len(got.DeviceToken) != 43 {
		t.Fatalf("response %q, %v", rec.Body, err)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Error("enrollment response is cacheable")
	}
	devs, err := admin.Devices(context.Background())
	if err != nil || len(devs) != 1 || devs[0].Name != "Kitchen iPad" || devs[0].UserAgent != "Safari/1" {
		t.Errorf("the admin sees %+v, %v", devs, err)
	}
	if pending, err := admin.PendingInvites(context.Background(), time.Now()); err != nil || len(pending) != 0 {
		t.Errorf("pending invites after use: %v, %v", pending, err)
	}

	// The token works with a proof from the same key and with nothing else.
	auth := func(token string, p string) int {
		return do(h, "GET", "/whoami", "", map[string]string{"Authorization": "DPoP " + token, "DPoP": p}).Code
	}
	if c := auth(got.DeviceToken, proof(t, k, "GET", "/whoami", got.DeviceToken)); c != 200 || *hits != 1 {
		t.Fatalf("whoami with the right key = %d", c)
	}
	other := authtest.NewKey(t) // a copied token without the key
	if c := auth(got.DeviceToken, proof(t, other, "GET", "/whoami", got.DeviceToken)); c != 401 {
		t.Errorf("token with another key = %d, want 401", c)
	}
	if c := auth("x"+got.DeviceToken[1:], proof(t, k, "GET", "/whoami", "x"+got.DeviceToken[1:])); c != 401 {
		t.Errorf("unknown token = %d, want 401", c)
	}
	if c := do(h, "GET", "/whoami", "", map[string]string{"Authorization": "DPoP " + got.DeviceToken}).Code; c != 401 {
		t.Errorf("no proof = %d, want 401", c)
	}
	if c := do(h, "GET", "/whoami", "", map[string]string{"Authorization": "Bearer " + got.DeviceToken, "DPoP": proof(t, k, "GET", "/whoami", got.DeviceToken)}).Code; c != 401 {
		t.Errorf("Bearer scheme = %d, want 401", c)
	}
	if *hits != 1 {
		t.Errorf("handler ran %d times", *hits)
	}

	// Revoking the device (harper_admin deletes the row) ends access at once.
	if err := admin.RevokeDevice(context.Background(), devs[0].ID); err != nil {
		t.Fatal(err)
	}
	if c := auth(got.DeviceToken, proof(t, k, "GET", "/whoami", got.DeviceToken)); c != 401 {
		t.Errorf("after revoke = %d, want 401", c)
	}
}

func TestEnrollRefusals(t *testing.T) {
	k := authtest.NewKey(t)
	body := func(inv string) any { return map[string]string{"invite": inv, "deviceName": "d"} }
	hdr := func() map[string]string { return map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")} }

	tests := []struct {
		name string
		do   func(h http.Handler, invite string) *httptest.ResponseRecorder
		want int
	}{
		{"unknown invite", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", body(newInvite(t)), hdr())
		}, 401},
		{"malformed invite", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", body("short"), hdr())
		}, 401},
		{"no proof", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", body(invite), nil)
		}, 401},
		{"proof for another path", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", body(invite), map[string]string{"DPoP": proof(t, k, "POST", "/docs", "")})
		}, 401},
		{"two proofs", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			req := httptest.NewRequest("POST", "/enroll", strings.NewReader(`{"invite":"`+invite+`"}`))
			req.Header.Add("DPoP", proof(t, k, "POST", "/enroll", ""))
			req.Header.Add("DPoP", proof(t, k, "POST", "/enroll", ""))
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			return rec
		}, 401},
		{"not json", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", "{", hdr())
		}, 400},
		{"control character in the name (422)", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": "a\x01b"}, hdr())
		}, 422},
		{"long name (422)", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": strings.Repeat("é", 65)}, hdr())
		}, 422},
		{"body too large", func(h http.Handler, invite string) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": strings.Repeat("a", maxEnrollBody)}, hdr())
		}, 413},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			admin, db := newDB(t)
			h, _ := setup(t, db)
			if rec := tt.do(h, makeInvite(t, admin, "")); rec.Code != tt.want {
				t.Errorf("= %d %q, want %d", rec.Code, rec.Body, tt.want)
			}
			if devs, err := admin.Devices(context.Background()); err != nil || len(devs) != 0 {
				t.Errorf("a device was created: %v, %v", devs, err)
			}
		})
	}
}

func TestInviteIsSingleUseAndReplayIsRefused(t *testing.T) {
	admin, db := newDB(t)
	token := makeInvite(t, admin, "")
	h, _ := setup(t, db)
	k := authtest.NewKey(t)
	p := proof(t, k, "POST", "/enroll", "")
	hdr := map[string]string{"DPoP": p}
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": token}, hdr); rec.Code != 200 {
		t.Fatalf("first = %d", rec.Code)
	}
	// The same request again: the proof is a replay.
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": token}, hdr); rec.Code != 401 {
		t.Errorf("replayed request = %d, want 401", rec.Code)
	}
	// A fresh proof with the spent invite: the invite is the reason, and the answer is the same 401.
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": token}, map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")}); rec.Code != 401 {
		t.Errorf("spent invite = %d, want 401", rec.Code)
	}
	if devs, err := admin.Devices(context.Background()); err != nil || len(devs) != 1 {
		t.Errorf("%d devices, want 1 (%v)", len(devs), err)
	}
}

func TestStoreFailureIs500WithNoDetail(t *testing.T) {
	h, _ := setup(t, brokenStore{context.DeadlineExceeded})
	rec := do(h, "POST", "/enroll", map[string]string{"invite": newInvite(t)}, map[string]string{"DPoP": proof(t, authtest.NewKey(t), "POST", "/enroll", "")})
	if rec.Code != 500 || strings.Contains(rec.Body.String(), "deadline") {
		t.Errorf("= %d %q", rec.Code, rec.Body)
	}
}

func TestCORS(t *testing.T) {
	h, _ := setup(t, brokenStore{}, "https://app.example.org", "wails://wails")
	preflight := func(origin string) *httptest.ResponseRecorder {
		return do(h, "OPTIONS", "/enroll", "", map[string]string{
			"Origin": origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "dpop,content-type",
		})
	}
	for _, origin := range []string{"https://app.example.org", "wails://wails"} {
		rec := preflight(origin)
		if rec.Code != 204 || rec.Header().Get("Access-Control-Allow-Origin") != origin {
			t.Errorf("%s: preflight = %d, ACAO %q", origin, rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
		}
		if got := rec.Header().Get("Access-Control-Allow-Headers"); !strings.Contains(got, "DPoP") || !strings.Contains(got, "Authorization") {
			t.Errorf("allow headers = %q", got)
		}
		if rec.Header().Get("Access-Control-Allow-Credentials") != "" {
			t.Error("credentials are allowed: the API uses a header, not cookies")
		}
	}
	for _, origin := range []string{"https://evil.example", "https://app.example.org.evil.example", "https://app.example.org:444", "null"} {
		if rec := preflight(origin); rec.Code != 403 || rec.Header().Get("Access-Control-Allow-Origin") != "" {
			t.Errorf("%s: preflight = %d, ACAO %q", origin, rec.Code, rec.Header().Get("Access-Control-Allow-Origin"))
		}
	}
	// A real request from an allowed origin carries the header and Vary; from another origin it carries neither.
	rec := do(h, "POST", "/enroll", `{}`, map[string]string{"Origin": "https://app.example.org"})
	if rec.Header().Get("Access-Control-Allow-Origin") != "https://app.example.org" || !strings.Contains(rec.Header().Get("Vary"), "Origin") {
		t.Errorf("headers on a real request: %v", rec.Header())
	}
	if rec := do(h, "POST", "/enroll", `{}`, map[string]string{"Origin": "https://evil.example"}); rec.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Error("ACAO for a foreign origin")
	}
	// No Origin header: not a browser cross-origin call, nothing added.
	if rec := do(h, "POST", "/enroll", `{}`, nil); rec.Header().Get("Vary") != "" {
		t.Errorf("Vary without Origin: %v", rec.Header())
	}
}

func TestEachRejectedOriginIsLoggedOnce(t *testing.T) {
	prev := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))
	defer slog.SetDefault(prev)
	v := auth.NewVerifier()
	defer v.Close()
	api := New(publicURL, nil, brokenStore{}, v)
	for range 3 {
		api.logRejected("https://a.example")
	}
	api.logRejected("https://b.example")
	if len(api.logged) != 2 {
		t.Errorf("logged = %v", api.logged)
	}
	for i := range 3 * maxLoggedOrigins {
		api.logRejected(base64.RawURLEncoding.EncodeToString([]byte{byte(i), byte(i >> 8)}))
	}
	if len(api.logged) > maxLoggedOrigins {
		t.Errorf("the set grew to %d", len(api.logged))
	}
}

// The proof is checked before Huma reads or validates the body, so a caller without a valid proof learns nothing about the shape of
// a request: a broken body, an oversized one and a valid one all get the same answer.
func TestCredentialsAreCheckedBeforeTheBody(t *testing.T) {
	invite := newInvite(t)
	h, _ := setup(t, brokenStore{})
	for name, body := range map[string]string{
		"broken json": "{",
		"wrong types": `{"invite": 5}`,
		"too large":   `{"invite":"` + strings.Repeat("a", maxEnrollBody*2) + `"}`,
		"valid":       `{"invite":"` + invite + `"}`,
	} {
		if rec := do(h, "POST", "/enroll", body, nil); rec.Code != 401 {
			t.Errorf("%s without a proof = %d, want 401", name, rec.Code)
		}
	}
}

// Every way of failing the credential checks is the same response, byte for byte, so the cause cannot be read from it.
func TestCredentialFailuresAreIdentical(t *testing.T) {
	admin, db := newDB(t)
	unused := newInvite(t) // well formed, never made
	k := authtest.NewKey(t)
	h, _ := setup(t, db)
	good := func() map[string]string { return map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")} }

	spent := makeInvite(t, admin, "")
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": spent}, good()); rec.Code != 200 {
		t.Fatalf("setup: %d", rec.Code)
	}

	cases := map[string]*httptest.ResponseRecorder{
		"no proof":        do(h, "POST", "/enroll", map[string]string{"invite": unused}, nil),
		"proof for /docs": do(h, "POST", "/enroll", map[string]string{"invite": unused}, map[string]string{"DPoP": proof(t, k, "POST", "/docs", "")}),
		"junk proof":      do(h, "POST", "/enroll", map[string]string{"invite": unused}, map[string]string{"DPoP": "a.b.c"}),
		"unknown invite":  do(h, "POST", "/enroll", map[string]string{"invite": newInvite(t)}, good()),
		"malformed":       do(h, "POST", "/enroll", map[string]string{"invite": "short"}, good()),
		"spent invite":    do(h, "POST", "/enroll", map[string]string{"invite": spent}, good()),
	}
	var first string
	for name, rec := range cases {
		if rec.Code != 401 {
			t.Errorf("%s = %d, want 401", name, rec.Code)
		}
		if first == "" {
			first = rec.Header().Get("Content-Type") + "\n" + rec.Body.String()
		} else if got := rec.Header().Get("Content-Type") + "\n" + rec.Body.String(); got != first {
			t.Errorf("%s differs:\n%s\nvs\n%s", name, got, first)
		}
	}
	if !strings.Contains(first, `"detail":"unauthorized"`) || strings.Contains(first, "invite") {
		t.Errorf("unexpected 401 body: %s", first)
	}
}

// base64url has spare bits in the last character of a 32-byte value, so one key can be written several ways. It must still be one
// identity: a proof that spells the enrolled key differently is the same key (the thumbprint comes from the decoded coordinates), and
// a different key is not.
func TestARespelledKeyIsTheSameKey(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	k := authtest.NewKey(t)
	rec := do(h, "POST", "/enroll", map[string]string{"invite": makeInvite(t, admin, "")}, map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")})
	if rec.Code != 200 {
		t.Fatalf("enroll = %d", rec.Code)
	}
	var got struct {
		DeviceToken string `json:"deviceToken"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	get := func(header string) int {
		return do(h, "GET", "/whoami", "", map[string]string{"Authorization": "DPoP " + got.DeviceToken, "DPoP": header}).Code
	}
	if c := get(proof(t, k, "GET", "/whoami", got.DeviceToken)); c != 200 {
		t.Fatalf("the enrolled spelling = %d, want 200", c)
	}

	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	jwk := k.JWK()
	x := jwk["x"].(string)
	last := strings.IndexByte(alphabet, x[len(x)-1])
	for spare := 1; spare <= 3; spare++ {
		alt := map[string]any{}
		for a, b := range jwk {
			alt[a] = b
		}
		alt["x"] = x[:len(x)-1] + string(alphabet[last&^3|(last+spare)&3])
		jti := "respelled-" + strconv.Itoa(spare)
		p := k.Proof(t, map[string]any{"typ": "dpop+jwt", "alg": "ES256", "jwk": alt},
			authtest.Claims{JTI: jti, HTM: "GET", HTU: publicURL + "/whoami", IAT: time.Now().Unix(), ATH: authtest.ATH(got.DeviceToken)})
		if c := get(p); c != 200 {
			t.Errorf("spare bits %d: respelled key = %d, want 200 (the same key)", spare, c)
		}
	}
	if c := get(proof(t, authtest.NewKey(t), "GET", "/whoami", got.DeviceToken)); c != 401 {
		t.Errorf("another key = %d, want 401", c)
	}
}

// TestServesOpenAPI: Huma serves the document and a documentation page without a proof, and /docs stays the draft list.
func TestServesOpenAPI(t *testing.T) {
	h, _ := setup(t, brokenStore{})
	for path, want := range map[string]string{"/openapi.json": `"openapi"`, "/openapi.yaml": "openapi:", "/api": "<html"} {
		rec := do(h, "GET", path, "", nil)
		if rec.Code != 200 || !strings.Contains(rec.Body.String(), want) {
			t.Errorf("GET %s = %d, want 200 containing %q", path, rec.Code, want)
		}
	}
	if rec := do(h, "GET", "/docs", "", nil); rec.Code != 401 {
		t.Errorf("GET /docs without a proof = %d, want 401: it is the draft list", rec.Code)
	}
	if rec := do(h, "GET", "/schemas/Foo.json", "", nil); rec.Code != 404 {
		t.Errorf("GET /schemas/... = %d, want 404", rec.Code)
	}
}

func (b brokenStore) GetSetting(context.Context, int64) (store.Setting, error) {
	return store.Setting{}, b.err
}

func (b brokenStore) PutSetting(context.Context, int64, int64, string) (store.Setting, error) {
	return store.Setting{}, b.err
}
