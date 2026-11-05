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
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth"
	"github.com/cthtrifork/harper-pad/backend/internal/auth/authtest"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
	"github.com/danielgtaylor/huma/v2"
)

const publicURL = "https://sync.example.org"

// fakeStore keeps invites and devices in memory with the same rules as store.Sync.
type fakeStore struct {
	mu      sync.Mutex
	invites map[string]string // hash -> device name; deleted when spent
	devices map[string]store.Device
	names   map[string]string
	agents  map[string]string
	fail    error
}

func newFake(invite, name string) *fakeStore {
	return &fakeStore{
		invites: map[string]string{string(auth.HashToken(invite)): name},
		devices: map[string]store.Device{}, names: map[string]string{}, agents: map[string]string{},
	}
}

func (f *fakeStore) Enroll(_ context.Context, inviteHash []byte, id, name, ua, key string, tokenHash []byte) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.fail != nil {
		return f.fail
	}
	n, ok := f.invites[string(inviteHash)]
	if !ok {
		return store.ErrInvalidInvite
	}
	delete(f.invites, string(inviteHash))
	if n != "" {
		name = n
	}
	f.devices[string(tokenHash)] = store.Device{ID: id, ClientID: 1, PublicKey: key}
	f.names[id], f.agents[id] = name, ua
	return nil
}

func (f *fakeStore) DeviceByToken(_ context.Context, h []byte) (store.Device, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if d, ok := f.devices[string(h)]; ok {
		return d, nil
	}
	return store.Device{}, store.ErrUnknownToken
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
	v.Now = func() time.Time { return authtest.Now }
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

var jti int

func proof(t *testing.T, k authtest.Key, method, path, token string) string {
	t.Helper()
	jti++
	c := authtest.Claims{JTI: strings.Repeat("j", 1) + string(rune('a'+jti%26)) + time.Now().String() + string(rune(jti)), HTM: method, HTU: publicURL + path, IAT: authtest.Now.Unix()}
	if token != "" {
		c.ATH = authtest.ATH(token)
	}
	return k.Proof(t, nil, c)
}

func TestEnrollThenAuthenticate(t *testing.T) {
	invite := newInvite(t)
	st := newFake(invite, "Kitchen iPad")
	h, hits := setup(t, st)
	k := authtest.NewKey(t)

	rec := do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": "ignored"},
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
	for id, name := range st.names {
		if name != "Kitchen iPad" || st.agents[id] != "Safari/1" {
			t.Errorf("device stored as %q / %q", name, st.agents[id])
		}
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
}

func TestEnrollRefusals(t *testing.T) {
	invite := newInvite(t)
	k := authtest.NewKey(t)
	body := func(inv string) any { return map[string]string{"invite": inv, "deviceName": "d"} }
	hdr := func() map[string]string { return map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")} }

	tests := []struct {
		name string
		do   func(h http.Handler) *httptest.ResponseRecorder
		want int
	}{
		{"unknown invite", func(h http.Handler) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", body(newInvite(t)), hdr())
		}, 401},
		{"malformed invite", func(h http.Handler) *httptest.ResponseRecorder { return do(h, "POST", "/enroll", body("short"), hdr()) }, 401},
		{"no proof", func(h http.Handler) *httptest.ResponseRecorder { return do(h, "POST", "/enroll", body(invite), nil) }, 401},
		{"proof for another path", func(h http.Handler) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", body(invite), map[string]string{"DPoP": proof(t, k, "POST", "/docs", "")})
		}, 401},
		{"two proofs", func(h http.Handler) *httptest.ResponseRecorder {
			req := httptest.NewRequest("POST", "/enroll", strings.NewReader(`{"invite":"`+invite+`"}`))
			req.Header.Add("DPoP", proof(t, k, "POST", "/enroll", ""))
			req.Header.Add("DPoP", proof(t, k, "POST", "/enroll", ""))
			rec := httptest.NewRecorder()
			h.ServeHTTP(rec, req)
			return rec
		}, 401},
		{"not json", func(h http.Handler) *httptest.ResponseRecorder { return do(h, "POST", "/enroll", "{", hdr()) }, 400},
		{"control character in the name (422)", func(h http.Handler) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": "a\x01b"}, hdr())
		}, 422},
		{"long name (422)", func(h http.Handler) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": strings.Repeat("é", 65)}, hdr())
		}, 422},
		{"body too large", func(h http.Handler) *httptest.ResponseRecorder {
			return do(h, "POST", "/enroll", map[string]string{"invite": invite, "deviceName": strings.Repeat("a", maxEnrollBody)}, hdr())
		}, 413},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st := newFake(invite, "")
			h, _ := setup(t, st)
			if rec := tt.do(h); rec.Code != tt.want {
				t.Errorf("= %d %q, want %d", rec.Code, rec.Body, tt.want)
			}
			if len(st.devices) != 0 {
				t.Error("a device was created")
			}
		})
	}
}

func TestInviteIsSingleUseAndReplayIsRefused(t *testing.T) {
	invite := newInvite(t)
	st := newFake(invite, "")
	h, _ := setup(t, st)
	k := authtest.NewKey(t)
	p := proof(t, k, "POST", "/enroll", "")
	hdr := map[string]string{"DPoP": p}
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": invite}, hdr); rec.Code != 200 {
		t.Fatalf("first = %d", rec.Code)
	}
	// The same request again: the proof is a replay.
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": invite}, hdr); rec.Code != 401 {
		t.Errorf("replayed request = %d, want 401", rec.Code)
	}
	// A fresh proof with the spent invite: the invite is the reason, and the answer is the same 401.
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": invite}, map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")}); rec.Code != 401 {
		t.Errorf("spent invite = %d, want 401", rec.Code)
	}
	if len(st.devices) != 1 {
		t.Errorf("%d devices, want 1", len(st.devices))
	}
}

func TestStoreFailureIs500WithNoDetail(t *testing.T) {
	invite := newInvite(t)
	st := newFake(invite, "")
	st.fail = context.DeadlineExceeded
	h, _ := setup(t, st)
	rec := do(h, "POST", "/enroll", map[string]string{"invite": invite}, map[string]string{"DPoP": proof(t, authtest.NewKey(t), "POST", "/enroll", "")})
	if rec.Code != 500 || strings.Contains(rec.Body.String(), "deadline") {
		t.Errorf("= %d %q", rec.Code, rec.Body)
	}
}

func TestCORS(t *testing.T) {
	h, _ := setup(t, newFake("x", ""), "https://app.example.org", "wails://wails")
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
	api := New(publicURL, nil, newFake("x", ""), auth.NewVerifier())
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
	h, _ := setup(t, newFake(invite, ""))
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
	invite := newInvite(t)
	k := authtest.NewKey(t)
	st := newFake(invite, "")
	h, _ := setup(t, st)
	good := func() map[string]string { return map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")} }

	spent := newInvite(t)
	st.invites[string(auth.HashToken(spent))] = ""
	if rec := do(h, "POST", "/enroll", map[string]string{"invite": spent}, good()); rec.Code != 200 {
		t.Fatalf("setup: %d", rec.Code)
	}

	cases := map[string]*httptest.ResponseRecorder{
		"no proof":        do(h, "POST", "/enroll", map[string]string{"invite": invite}, nil),
		"proof for /docs": do(h, "POST", "/enroll", map[string]string{"invite": invite}, map[string]string{"DPoP": proof(t, k, "POST", "/docs", "")}),
		"junk proof":      do(h, "POST", "/enroll", map[string]string{"invite": invite}, map[string]string{"DPoP": "a.b.c"}),
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
