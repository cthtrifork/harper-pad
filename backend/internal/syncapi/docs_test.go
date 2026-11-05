package syncapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cthtrifork/harper-pad/backend/internal/auth/authtest"
	"github.com/cthtrifork/harper-pad/backend/internal/protocol"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

const (
	id1 = "00000000000000000000000000000001"
	id2 = "00000000000000000000000000000002"
	id3 = "00000000000000000000000000000003"
)

func blob(content string) string {
	b, _ := json.Marshal(map[string]any{"v": 1, "format": "markdown", "content": content})
	return string(b)
}

// device is an enrolled device that can sign requests.
type device struct {
	t     *testing.T
	h     http.Handler
	key   authtest.Key
	token string
}

func enrollDevice(t *testing.T, h http.Handler, invite string) *device {
	t.Helper()
	k := authtest.NewKey(t)
	rec := do(h, "POST", "/enroll", map[string]string{"invite": invite}, map[string]string{"DPoP": proof(t, k, "POST", "/enroll", "")})
	if rec.Code != 200 {
		t.Fatalf("enroll = %d %s", rec.Code, rec.Body)
	}
	var got struct {
		DeviceToken string `json:"deviceToken"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	return &device{t: t, h: h, key: k, token: got.DeviceToken}
}

func (d *device) call(method, path string, body any, extra ...string) *httptest.ResponseRecorder {
	d.t.Helper()
	// proof for the path without its query: htu has none (RFC 9449 section 4.2)
	p, _, _ := strings.Cut(path, "?")
	hdr := map[string]string{"Authorization": "DPoP " + d.token, "DPoP": proof(d.t, d.key, method, p, d.token)}
	for i := 0; i+1 < len(extra); i += 2 {
		hdr[extra[i]] = extra[i+1]
	}
	if body == nil {
		body = ""
	}
	return do(d.h, method, path, body, hdr)
}

type putBody struct {
	Base      map[string]int64 `json:"base"`
	CreatedAt int64            `json:"createdAt"`
	UpdatedAt int64            `json:"updatedAt"`
	Deleted   bool             `json:"deleted"`
	Data      string           `json:"data"`
}

func base(version, updatedAt int64) map[string]int64 {
	return map[string]int64{"version": version, "updatedAt": updatedAt}
}

func twoDevices(t *testing.T) (a, b *device) {
	t.Helper()
	admin, db := newDB(t)
	h, _ := setup(t, db)
	return enrollDevice(t, h, makeInvite(t, admin, "A")), enrollDevice(t, h, makeInvite(t, admin, "B"))
}

func getDoc(t *testing.T, d *device, id string) Doc {
	t.Helper()
	var doc Doc
	if rec := d.call("GET", "/docs/"+id, nil); rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &doc) != nil {
		t.Fatalf("get %s = %d %s", id, rec.Code, rec.Body)
	}
	return doc
}

func version(t *testing.T, rec *httptest.ResponseRecorder) int64 {
	t.Helper()
	var v struct {
		Version int64 `json:"version"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &v); err != nil {
		t.Fatalf("%v: %s", err, rec.Body)
	}
	return v.Version
}

func TestPutCreatesThenUpdates(t *testing.T) {
	a, b := twoDevices(t)

	rec := a.call("PUT", "/docs/"+id1, putBody{Base: base(0, 0), CreatedAt: 100, UpdatedAt: 100, Data: blob("one")})
	if rec.Code != 200 || version(t, rec) != 1 {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	if rec.Header().Get("Cache-Control") != "no-store" {
		t.Error("PUT response is cacheable")
	}
	// the same account on another device sees it, and writes on top with the right base
	rec = b.call("PUT", "/docs/"+id1, putBody{Base: base(1, 100), CreatedAt: 100, UpdatedAt: 200, Data: blob("two")})
	if rec.Code != 200 || version(t, rec) != 2 {
		t.Fatalf("update = %d %s", rec.Code, rec.Body)
	}
	rec = a.call("GET", "/docs/"+id1, nil)
	var d Doc
	if err := json.Unmarshal(rec.Body.Bytes(), &d); err != nil || rec.Code != 200 {
		t.Fatalf("get = %d %s", rec.Code, rec.Body)
	}
	if d.Version != 2 || d.UpdatedAt != 200 || d.CreatedAt != 100 || d.Deleted || d.Data != blob("two") {
		t.Errorf("stored = %+v", d)
	}
}

func TestPutConflictReturnsCurrentCopy(t *testing.T) {
	a, b := twoDevices(t)
	a.call("PUT", "/docs/"+id1, putBody{Base: base(0, 0), CreatedAt: 100, UpdatedAt: 100, Data: blob("one")})
	a.call("PUT", "/docs/"+id1, putBody{Base: base(1, 100), CreatedAt: 100, UpdatedAt: 200, Data: blob("a's edit")})

	// b still has version 1: stale base
	rec := b.call("PUT", "/docs/"+id1, putBody{Base: base(1, 100), CreatedAt: 100, UpdatedAt: 300, Data: blob("b's edit")})
	if rec.Code != 409 {
		t.Fatalf("stale base = %d %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Errorf("content type %q", ct)
	}
	var c conflictBody
	if err := json.Unmarshal(rec.Body.Bytes(), &c); err != nil || c.Current == nil {
		t.Fatalf("409 body %s, %v", rec.Body, err)
	}
	if c.Current.Version != 2 || c.Current.UpdatedAt != 200 || c.Current.Data != blob("a's edit") {
		t.Errorf("current = %+v", c.Current)
	}
	// nothing changed
	var d Doc
	_ = json.Unmarshal(a.call("GET", "/docs/"+id1, nil).Body.Bytes(), &d)
	if d.Version != 2 || d.Data != blob("a's edit") {
		t.Errorf("a refused write changed the draft: %+v", d)
	}

	// the right version with a wrong updatedAt is stale too: a write is checked against the exact state the device saw
	if rec := b.call("PUT", "/docs/"+id1, putBody{Base: base(2, 999), UpdatedAt: 400, Data: blob("x")}); rec.Code != 409 {
		t.Errorf("wrong base updatedAt = %d", rec.Code)
	}
	// creating an id that exists is a conflict, not an overwrite
	if rec := b.call("PUT", "/docs/"+id1, putBody{Base: base(0, 0), UpdatedAt: 400, Data: blob("x")}); rec.Code != 409 {
		t.Errorf("create over an existing draft = %d", rec.Code)
	}
	// a base for a draft the server lacks: 409 without a copy
	rec = b.call("PUT", "/docs/"+id2, putBody{Base: base(3, 10), UpdatedAt: 400, Data: blob("x")})
	if rec.Code != 409 || strings.Contains(rec.Body.String(), `"current"`) {
		t.Errorf("base for a missing draft = %d %s", rec.Code, rec.Body)
	}
}

func TestDeleteClearsTextAndEditRevives(t *testing.T) {
	a, b := twoDevices(t)
	a.call("PUT", "/docs/"+id1, putBody{Base: base(0, 0), CreatedAt: 1, UpdatedAt: 1, Data: blob("secret")})

	rec := a.call("PUT", "/docs/"+id1, putBody{Base: base(1, 1), CreatedAt: 1, UpdatedAt: 2, Deleted: true})
	if rec.Code != 200 || version(t, rec) != 2 {
		t.Fatalf("delete = %d %s", rec.Code, rec.Body)
	}
	if d := getDoc(t, a, id1); !d.Deleted || d.Data != "" {
		t.Errorf("tombstone kept text: %+v", d)
	}
	// a tombstone is a row with a version: a device that edited the draft pushes on top of it and the draft is live again
	rec = b.call("PUT", "/docs/"+id1, putBody{Base: base(2, 2), CreatedAt: 1, UpdatedAt: 3, Data: blob("kept")})
	if rec.Code != 200 || version(t, rec) != 3 {
		t.Fatalf("edit over a tombstone = %d %s", rec.Code, rec.Body)
	}
	if d := getDoc(t, a, id1); d.Deleted || d.Data != blob("kept") {
		t.Errorf("after revive: %+v", d)
	}
	// a tombstone for an id the server has never seen is stored (a device deleting what it had not uploaded)
	if rec := a.call("PUT", "/docs/"+id2, putBody{Base: base(0, 0), UpdatedAt: 5, Deleted: true}); rec.Code != 200 {
		t.Errorf("tombstone for a new id = %d %s", rec.Code, rec.Body)
	}
}

func TestPutLimitsAndValidation(t *testing.T) {
	a, _ := twoDevices(t)
	put := func(id string, b putBody) *httptest.ResponseRecorder { return a.call("PUT", "/docs/"+id, b) }
	ok := func(data string) putBody { return putBody{Base: base(0, 0), CreatedAt: 1, UpdatedAt: 1, Data: data} }

	huge := blob(strings.Repeat("x", protocol.MaxContentBytes+1))
	atLimit := blob(strings.Repeat("x", protocol.MaxContentBytes))
	tests := []struct {
		name string
		rec  *httptest.ResponseRecorder
		want int
	}{
		{"content at the limit", put(id1, ok(atLimit)), 200},
		{"content over the limit", put(id2, ok(huge)), 413},
		{"data over 8 MiB", put(id2, ok(strings.Repeat("x", protocol.MaxDataBytes+1))), 413},
		{"bad id", put("ABC", ok(blob("x"))), 422},
		{"id with the wrong length", put(id1[:31], ok(blob("x"))), 422},
		{"data is not json", put(id2, ok("hello")), 422},
		{"unknown blob version", put(id2, ok(`{"v":2,"format":"markdown","content":"x"}`)), 422},
		{"unknown format", put(id2, ok(`{"v":1,"format":"rtf","content":"x"}`)), 422},
		{"no content", put(id2, ok(`{"v":1,"format":"text"}`)), 422},
		// Invalid UTF-8 on the wire never reaches the check: the JSON decoder turns it into U+FFFD, so what is stored is always valid.
		// protocol.ValidateData still checks it (protocol_test.go).
		{"deleted with data", put(id2, putBody{Base: base(0, 0), UpdatedAt: 1, Deleted: true, Data: blob("x")}), 422},
		{"live with empty data", put(id2, ok("")), 422},
		{"negative base", put(id2, putBody{Base: base(-1, 0), UpdatedAt: 1, Data: blob("x")}), 422},
		{"not json", a.call("PUT", "/docs/"+id2, "{"), 400},
	}
	for _, tc := range tests {
		if tc.rec.Code != tc.want {
			t.Errorf("%s = %d, want %d (%.120s)", tc.name, tc.rec.Code, tc.want, tc.rec.Body)
		}
	}
	// nothing was stored by a refused write; only the draft at the limit exists
	if rec := a.call("GET", "/docs", nil); strings.Count(rec.Body.String(), `"id"`) != 1 {
		t.Errorf("drafts stored: %s, want 1", rec.Body)
	}
}

func TestListDocs(t *testing.T) {
	a, _ := twoDevices(t)
	for i, id := range []string{id3, id1, id2} { // created out of order, listed in id order
		a.call("PUT", "/docs/"+id, putBody{Base: base(0, 0), CreatedAt: 1, UpdatedAt: int64(10 + i), Data: blob("x" + id)})
	}
	a.call("PUT", "/docs/"+id2, putBody{Base: base(1, 12), CreatedAt: 1, UpdatedAt: 20, Deleted: true})

	list := func(q string) []DocState {
		rec := a.call("GET", "/docs"+q, nil)
		if rec.Code != 200 {
			t.Fatalf("list %s = %d %s", q, rec.Code, rec.Body)
		}
		if strings.Contains(rec.Body.String(), "x"+id1) {
			t.Fatal("the list carries text")
		}
		var out []DocState
		if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
			t.Fatal(err)
		}
		return out
	}
	all := list("")
	if len(all) != 3 || all[0].ID != id1 || all[1].ID != id2 || all[2].ID != id3 {
		t.Fatalf("list = %+v", all)
	}
	if !all[1].Deleted || all[1].UpdatedAt != 20 || all[1].Version != 2 {
		t.Errorf("tombstone entry = %+v", all[1])
	}
	if page := list("?limit=2"); len(page) != 2 || page[1].ID != id2 {
		t.Errorf("first page = %+v", page)
	}
	if page := list("?after=" + id2 + "&limit=2"); len(page) != 1 || page[0].ID != id3 {
		t.Errorf("second page = %+v", page)
	}
	if page := list("?after=" + id3); len(page) != 0 || page == nil {
		t.Errorf("past the end = %+v", page)
	}
	for _, q := range []string{"?limit=0", "?limit=1001", "?after=XYZ", "?limit=abc"} {
		if rec := a.call("GET", "/docs"+q, nil); rec.Code != 422 {
			t.Errorf("GET /docs%s = %d, want 422", q, rec.Code)
		}
	}
}

func TestGetDocETag(t *testing.T) {
	a, _ := twoDevices(t)
	a.call("PUT", "/docs/"+id1, putBody{Base: base(0, 0), CreatedAt: 1, UpdatedAt: 7, Data: blob("x")})

	rec := a.call("GET", "/docs/"+id1, nil)
	tag := rec.Header().Get("ETag")
	if rec.Code != 200 || tag != `"7-0"` {
		t.Fatalf("get = %d, ETag %q", rec.Code, tag)
	}
	for _, inm := range []string{tag, `W/` + tag, `"1-0", ` + tag, "*"} {
		rec := a.call("GET", "/docs/"+id1, nil, "If-None-Match", inm)
		if rec.Code != 304 || rec.Body.Len() != 0 {
			t.Errorf("If-None-Match %q = %d with %d body bytes", inm, rec.Code, rec.Body.Len())
		}
	}
	if rec := a.call("GET", "/docs/"+id1, nil, "If-None-Match", `"6-0"`); rec.Code != 200 {
		t.Errorf("different state = %d", rec.Code)
	}
	// deleted changes the state even at the same updatedAt
	a.call("PUT", "/docs/"+id1, putBody{Base: base(1, 7), CreatedAt: 1, UpdatedAt: 7, Deleted: true})
	rec = a.call("GET", "/docs/"+id1, nil, "If-None-Match", tag)
	if rec.Code != 200 || rec.Header().Get("ETag") != `"7-1"` || !strings.Contains(rec.Body.String(), `"deleted":true`) {
		t.Errorf("tombstone = %d %s %s", rec.Code, rec.Header().Get("ETag"), rec.Body)
	}
	if rec := a.call("GET", "/docs/"+id2, nil); rec.Code != 404 {
		t.Errorf("unknown id = %d", rec.Code)
	}
	if rec := a.call("GET", "/docs/nope", nil); rec.Code != 422 {
		t.Errorf("malformed id = %d", rec.Code)
	}
}

func TestDocRoutesNeedADevice(t *testing.T) {
	a, _ := twoDevices(t)
	h := a.h
	unsigned := map[string]string{}
	for _, tc := range []struct{ method, path string }{{"GET", "/docs"}, {"GET", "/docs/" + id1}, {"PUT", "/docs/" + id1}} {
		var body any = ""
		if tc.method == "PUT" {
			body = putBody{Base: base(0, 0), UpdatedAt: 1, Data: blob("x")}
		}
		if rec := do(h, tc.method, tc.path, body, unsigned); rec.Code != 401 {
			t.Errorf("%s %s without credentials = %d", tc.method, tc.path, rec.Code)
		}
		// a valid token with a proof made for another route
		other := map[string]string{"Authorization": "DPoP " + a.token, "DPoP": proof(t, a.key, "GET", "/whoami", a.token)}
		if rec := do(h, tc.method, tc.path, body, other); rec.Code != 401 {
			t.Errorf("%s %s with a proof for another route = %d", tc.method, tc.path, rec.Code)
		}
	}
	// the same 401 whatever the cause, and the body is not read before the proof is checked
	rec := do(h, "PUT", "/docs/"+id1, "not json", unsigned)
	if rec.Code != 401 {
		t.Errorf("garbage body without a proof = %d", rec.Code)
	}
}

// failingDocs is the real store for devices whose draft calls fail.
type failingDocs struct{ *store.Sync }

func (failingDocs) ListDocs(context.Context, int64, string, int) ([]store.DocState, error) {
	return nil, http.ErrAbortHandler
}

func (failingDocs) GetDoc(context.Context, int64, string) (store.Doc, error) {
	return store.Doc{}, http.ErrAbortHandler
}

func (failingDocs) PutDoc(context.Context, int64, string, store.DocBase, store.DocWrite) (store.Doc, error) {
	return store.Doc{}, http.ErrAbortHandler
}

func TestDocRoutesHideStoreErrors(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, failingDocs{db})
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	for _, rec := range []*httptest.ResponseRecorder{
		a.call("GET", "/docs", nil),
		a.call("GET", "/docs/"+id1, nil),
		a.call("PUT", "/docs/"+id1, putBody{Base: base(0, 0), UpdatedAt: 1, Data: blob("x")}),
	} {
		if rec.Code != 500 || strings.Contains(rec.Body.String(), "abort") {
			t.Errorf("store failure = %d %s", rec.Code, rec.Body)
		}
	}
}
