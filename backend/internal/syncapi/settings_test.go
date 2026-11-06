package syncapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"

	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

func doc(words, ignored string) string {
	return `{"v":1,"words":[` + words + `],"ignored":[` + ignored + `]}`
}

type settingBody struct {
	BaseVersion int64  `json:"baseVersion"`
	Data        string `json:"data"`
}

func TestSettingsRoundTripAndConflict(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	b := enrollDevice(t, h, makeInvite(t, admin, "B"))

	if rec := a.call("GET", "/settings", nil); rec.Code != 404 {
		t.Fatalf("empty server = %d %s", rec.Code, rec.Body)
	}
	one := doc(`"Wails"`, `"42"`)
	rec := a.call("PUT", "/settings", settingBody{0, one})
	if rec.Code != 200 || version(t, rec) != 1 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	var got Setting
	if rec := b.call("GET", "/settings", nil); rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &got) != nil || got.Version != 1 || got.Data != one {
		t.Fatalf("other device reads = %d %s", rec.Code, rec.Body)
	}
	// b writes on top, then a writes on its old base: 409 with the current copy
	two := doc(`"Wails","Harper"`, ``)
	if rec := b.call("PUT", "/settings", settingBody{1, two}); rec.Code != 200 || version(t, rec) != 2 {
		t.Fatalf("update = %d %s", rec.Code, rec.Body)
	}
	rec = a.call("PUT", "/settings", settingBody{1, one})
	var c struct {
		Current *Setting `json:"current"`
	}
	if rec.Code != 409 || json.Unmarshal(rec.Body.Bytes(), &c) != nil || c.Current == nil || c.Current.Version != 2 || c.Current.Data != two {
		t.Fatalf("stale base = %d %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Errorf("content type %q", ct)
	}
	// a, now on the current version, overwrites: the last write wins
	if rec := a.call("PUT", "/settings", settingBody{2, one}); rec.Code != 200 || version(t, rec) != 3 {
		t.Errorf("overwrite = %d %s", rec.Code, rec.Body)
	}
}

func TestSettingsBaseForNothingIsAConflictWithoutACopy(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	if rec := a.call("PUT", "/settings", settingBody{5, doc("", "")}); rec.Code != 409 || strings.Contains(rec.Body.String(), `"current"`) {
		t.Errorf("base for a missing row = %d %s", rec.Code, rec.Body)
	}
}

func TestSettingsValidation(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	for name, data := range map[string]string{
		"not json":         "nope",
		"wrong version":    `{"v":2,"words":[],"ignored":[]}`,
		"no words":         `{"v":1,"ignored":[]}`,
		"no ignored":       `{"v":1,"words":[]}`,
		"a phrase":         doc(`"two words"`, ``),
		"a long word":      doc(`"`+strings.Repeat("a", 65)+`"`, ``),
		"an empty word":    doc(`""`, ``),
		"a hash with text": doc(``, `"abc"`),
		"a long hash":      doc(``, `"123456789012345678901"`),
		"too many words":   doc(manyItems(maxWords+1, "w"), ``),
		"too many hashes":  doc(``, manyItems(maxIgnored+1, "")),
	} {
		if rec := a.call("PUT", "/settings", settingBody{0, data}); rec.Code != 422 {
			t.Errorf("%s = %d %s", name, rec.Code, rec.Body)
		}
	}
	if rec := a.call("PUT", "/settings", settingBody{0, doc(`"Wails"`, `"12345678901234567890"`)}); rec.Code != 200 {
		t.Errorf("valid document = %d %s", rec.Code, rec.Body)
	}
	// an empty dictionary is a valid document: someone may have removed every word
	if rec := a.call("PUT", "/settings", settingBody{1, doc("", "")}); rec.Code != 200 {
		t.Errorf("empty lists = %d %s", rec.Code, rec.Body)
	}
}

// manyItems is n quoted items: words "w0", "w1", ... with a prefix, or digit strings without one.
func manyItems(n int, prefix string) string {
	var sb strings.Builder
	for i := range n {
		if i > 0 {
			sb.WriteByte(',')
		}
		sb.WriteString(`"` + prefix + strconv.Itoa(i) + `"`)
	}
	return sb.String()
}

func TestSettingsNeedADevice(t *testing.T) {
	_, db := newDB(t)
	h, _ := setup(t, db)
	for _, m := range []string{"GET", "PUT"} {
		if rec := do(h, m, "/settings", "", nil); rec.Code != 401 {
			t.Errorf("%s without credentials = %d", m, rec.Code)
		}
	}
}

type failingSettings struct{ *store.Sync }

func (failingSettings) GetSetting(context.Context, int64) (store.Setting, error) {
	return store.Setting{}, http.ErrAbortHandler
}

func (failingSettings) PutSetting(context.Context, int64, int64, string) (store.Setting, error) {
	return store.Setting{}, http.ErrAbortHandler
}

func TestSettingRoutesHideStoreErrors(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, failingSettings{db})
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	for _, rec := range []*httptest.ResponseRecorder{
		a.call("GET", "/settings", nil),
		a.call("PUT", "/settings", settingBody{0, doc("", "")}),
	} {
		if rec.Code != 500 || strings.Contains(rec.Body.String(), "abort") {
			t.Errorf("store failure = %d %s", rec.Code, rec.Body)
		}
	}
}
