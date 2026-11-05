package admin_test

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/admin"
	"github.com/cthtrifork/harper-pad/backend/internal/pgtest"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

// twoAccounts reports a second client account, which the admin app must refuse to create invites for.
type twoAccounts struct{ admin.Store }

func (twoAccounts) Accounts(context.Context) ([]admin.Account, error) {
	return []admin.Account{{ID: 1, Name: "default"}, {ID: 2, Name: "family"}}, nil
}

// failing is a Store whose Devices call fails with a database error that must not reach the page.
type failing struct{ admin.Store }

func (failing) Devices(context.Context) ([]admin.Device, error) {
	return nil, errors.New("dial tcp 10.0.0.7:5432: connection refused")
}

// newStore connects to the stack's PostgreSQL as harper_admin (the table owner, which applies the migrations) and seeds the three
// devices the tests expect: Desktop seen 2 minutes ago, iPhone 27 hours ago, Old laptop 37 days ago. Each test starts from empty
// devices and invites tables and the single default account.
func newStore(t *testing.T) admin.Store {
	t.Helper()
	ctx := context.Background()
	pgtest.Login(t, "harper_admin", "admin")
	pool, err := store.Open(ctx, "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)
	if _, err := store.Migrate(ctx, pool, store.Migrations); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `TRUNCATE devices, invites; DELETE FROM clients WHERE id <> 1`); err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	for _, d := range []struct {
		id, name string
		created  time.Duration
		seen     time.Duration
	}{
		{"d1", "Desktop", 23 * day, 150 * time.Second},
		{"d2", "iPhone", 7 * day, 27 * time.Hour},
		{"d3", "Old laptop", 62 * day, 37*day + time.Hour},
	} {
		_, err := pool.Exec(ctx,
			`INSERT INTO devices (id, client_id, name, user_agent, token_hash, key_thumbprint, created_at, last_seen)
			 VALUES ($1::text, 1, $2, 'Safari', sha256(convert_to($1::text, 'UTF8')), '{}', $3, $4)`,
			d.id, d.name, now.Add(-d.created).UnixMilli(), now.Add(-d.seen).UnixMilli())
		if err != nil {
			t.Fatal(err)
		}
	}
	return store.NewAdmin(pool)
}

const day = 24 * time.Hour

type client struct {
	t     *testing.T
	h     http.Handler
	token string
}

// newClient makes a first request, as a browser would, to get the CSRF cookie.
func newClient(t *testing.T, s admin.Store) *client {
	t.Helper()
	c := &client{t: t, h: admin.New(s, admin.Config{SyncURL: "https://sync.example.test/"})}
	rec := c.do("GET", "/", nil, nil)
	for _, ck := range rec.Result().Cookies() {
		if ck.Name == admin.CSRFCookie {
			c.token = ck.Value
		}
	}
	if c.token == "" {
		t.Fatal("no CSRF cookie issued")
	}
	return c
}

// do sends a request; unless headers say otherwise a state-changing one is a same-origin htmx request with the token.
func (c *client) do(method, path string, form url.Values, headers map[string]string) *httptest.ResponseRecorder {
	var body *strings.Reader
	if form != nil {
		body = strings.NewReader(form.Encode())
	} else {
		body = strings.NewReader("")
	}
	r := httptest.NewRequest(method, path, body)
	r.Host = "admin.example.test"
	if form != nil {
		r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	}
	if c.token != "" {
		r.AddCookie(&http.Cookie{Name: admin.CSRFCookie, Value: c.token})
		if method != "GET" {
			r.Header.Set("X-CSRF-Token", c.token)
			r.Header.Set("Sec-Fetch-Site", "same-origin")
			r.Header.Set("HX-Request", "true")
		}
	}
	for k, v := range headers {
		if v == "" {
			r.Header.Del(k)
		} else {
			r.Header.Set(k, v)
		}
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, r)
	return rec
}

func TestTemplatesParse(t *testing.T) { admin.New(nil, admin.Config{}) } // New panics on a bad template

func TestDevicesPage(t *testing.T) {
	c := newClient(t, newStore(t))
	rec := c.do("GET", "/", nil, nil)
	if rec.Code != 200 {
		t.Fatalf("status %d", rec.Code)
	}
	body := rec.Body.String()
	for _, want := range []string{"Desktop", "iPhone", "Old laptop", "2 min ago", "37 days ago", "Account: default", "X-CSRF-Token", `action="/invites"`} {
		if !strings.Contains(body, want) {
			t.Errorf("page lacks %q", want)
		}
	}
	h := rec.Header()
	if h.Get("Cache-Control") != "no-store" || !strings.Contains(h.Get("Content-Security-Policy"), "script-src 'self'") {
		t.Errorf("headers: %v", h)
	}
	if strings.Contains(body, " style=") || strings.Contains(body, " onclick=") {
		t.Error("inline style or handler would break the CSP")
	}
}

func TestStatic(t *testing.T) {
	c := newClient(t, newStore(t))
	for _, p := range []string{"/static/htmx.min.js", "/static/tokens.css", "/static/phone.css", "/static/admin.js"} {
		if rec := c.do("GET", p, nil, nil); rec.Code != 200 || rec.Body.Len() == 0 {
			t.Errorf("%s: %d", p, rec.Code)
		}
	}
	if rec := c.do("GET", "/enroll", nil, nil); rec.Code != 404 {
		t.Errorf("the old /enroll page should be gone: %d", rec.Code)
	}
}

func TestStateChangesNeedSameOriginAndToken(t *testing.T) {
	c := newClient(t, newStore(t))
	tests := map[string]map[string]string{
		"no token":       {"X-CSRF-Token": ""},
		"wrong token":    {"X-CSRF-Token": "nope"},
		"cross-site":     {"Sec-Fetch-Site": "cross-site"},
		"same-site":      {"Sec-Fetch-Site": "same-site"},
		"no origin info": {"Sec-Fetch-Site": ""},
		"foreign Origin": {"Sec-Fetch-Site": "", "Origin": "https://evil.example"},
	}
	for name, hdr := range tests {
		t.Run(name, func(t *testing.T) {
			if rec := c.do("DELETE", "/devices/d1", nil, hdr); rec.Code != 403 {
				t.Errorf("status %d, want 403", rec.Code)
			}
		})
	}
	if rec := c.do("DELETE", "/devices/d1", nil, map[string]string{"Sec-Fetch-Site": "", "Origin": "https://admin.example.test"}); rec.Code != 200 {
		t.Errorf("same Origin without Sec-Fetch-Site: %d", rec.Code)
	}
	if rec := c.do("GET", "/", nil, nil); strings.Contains(rec.Body.String(), "Desktop") {
		t.Error("the allowed request did not revoke, or a refused one did")
	}
}

func TestRename(t *testing.T) {
	c := newClient(t, newStore(t))
	if rec := c.do("GET", "/devices/d2/edit", nil, nil); !strings.Contains(rec.Body.String(), `hx-put="/devices/d2"`) {
		t.Errorf("edit form: %s", rec.Body)
	}
	rec := c.do("PUT", "/devices/d2", url.Values{"name": {"  Anna's <phone> "}}, nil)
	body := rec.Body.String()
	if rec.Code != 200 || !strings.Contains(body, "Anna&#39;s &lt;phone&gt;") || strings.Contains(body, "<html") {
		t.Errorf("rename: %d %s", rec.Code, body)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("x", 65), "a\x00b"} {
		rec := c.do("PUT", "/devices/d2", url.Values{"name": {bad}}, nil)
		if rec.Code != 422 || !strings.Contains(rec.Body.String(), `class="err"`) {
			t.Errorf("name %q: %d", bad, rec.Code)
		}
	}
	rec = c.do("PUT", "/devices/nope", url.Values{"name": {"x"}}, nil)
	if rec.Code != 404 || rec.Header().Get("HX-Retarget") != "#flash" {
		t.Errorf("unknown device: %d %v", rec.Code, rec.Header())
	}
}

func TestRevoke(t *testing.T) {
	c := newClient(t, newStore(t))
	rec := c.do("DELETE", "/devices/d3", nil, nil)
	body := rec.Body.String()
	if rec.Code != 200 || strings.Contains(body, "Old laptop") || !strings.Contains(body, `id="devices-list"`) {
		t.Errorf("revoke: %d %s", rec.Code, body)
	}
	if rec := c.do("DELETE", "/devices/d3", nil, nil); rec.Code != 200 {
		t.Errorf("revoking twice: %d", rec.Code)
	}
	for _, id := range []string{"d1", "d2"} {
		c.do("DELETE", "/devices/"+id, nil, nil)
	}
	if rec := c.do("GET", "/", nil, nil); !strings.Contains(rec.Body.String(), "No devices yet") {
		t.Error("no empty state")
	}
}

func TestEnrollment(t *testing.T) {
	c := newClient(t, newStore(t))
	rec := c.do("POST", "/invites", url.Values{"name": {"iPhone 2"}}, nil)
	body := rec.Body.String()
	if rec.Code != 200 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("create: %d %v", rec.Code, rec.Header())
	}
	for _, want := range []string{`https://sync.example.test/join#`, "iPhone 2", `id="pending"`, "hx-swap-oob"} {
		if !strings.Contains(body, want) {
			t.Errorf("response lacks %q", want)
		}
	}
	if !regexp.MustCompile(`>in (14:5\d|15:00)<`).MatchString(body) {
		t.Error("response lacks the countdown")
	}
	// The URL is shown once: neither the pending list nor a reload has the token.
	i := strings.Index(body, "/join#")
	token := body[i+len("/join#") : i+len("/join#")+43]
	page := c.do("GET", "/", nil, nil).Body.String()
	if strings.Contains(page, token) || !strings.Contains(page, "iPhone 2") {
		t.Error("pending list leaks the token or lost the invite")
	}

	// Without htmx the same form posts a normal page.
	full := c.do("POST", "/invites", url.Values{"name": {"Laptop"}, "csrf": {c.token}}, map[string]string{"HX-Request": "", "X-CSRF-Token": ""})
	if full.Code != 200 || !strings.Contains(full.Body.String(), "<!doctype html>") || !strings.Contains(full.Body.String(), "/join#") {
		t.Errorf("plain post: %d", full.Code)
	}

	if rec := c.do("POST", "/invites", url.Values{"name": {" "}}, nil); rec.Code != 422 || strings.Contains(rec.Body.String(), "/join#") {
		t.Errorf("empty name: %d", rec.Code)
	}
}

func TestCancelInvite(t *testing.T) {
	c := newClient(t, newStore(t))
	c.do("POST", "/invites", url.Values{"name": {"Temp"}}, nil)
	page := c.do("GET", "/", nil, nil).Body.String()
	i := strings.Index(page, `hx-delete="/invites/`)
	if i < 0 {
		t.Fatal("no cancel button")
	}
	path := page[i+len(`hx-delete="`) : i+len(`hx-delete="`)+strings.Index(page[i+len(`hx-delete="`):], `"`)]
	rec := c.do("DELETE", path, nil, nil)
	if rec.Code != 200 || strings.Contains(rec.Body.String(), "Temp") || strings.Contains(rec.Body.String(), "iPhone") {
		t.Errorf("cancel: %d %s", rec.Code, rec.Body)
	}
}

func TestRefusesInviteWithSeveralAccounts(t *testing.T) {
	c := newClient(t, twoAccounts{newStore(t)})
	rec := c.do("POST", "/invites", url.Values{"name": {"x"}}, nil)
	if rec.Code != 409 || strings.Contains(rec.Body.String(), "/join#") {
		t.Errorf("%d %s", rec.Code, rec.Body)
	}
}

func TestUnexpectedErrorIsLoggedNotShown(t *testing.T) {
	c := newClient(t, failing{newStore(t)})
	rec := c.do("GET", "/", nil, nil)
	if rec.Code != 500 || strings.Contains(rec.Body.String(), "10.0.0.7") || !strings.Contains(rec.Body.String(), "Something went wrong") {
		t.Errorf("%d %s", rec.Code, rec.Body)
	}
}
