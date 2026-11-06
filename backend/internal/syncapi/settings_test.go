package syncapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

func wordsDoc(items string) string { return `{"v":1,"items":{` + items + `}}` }

type settingBody struct {
	BaseVersion int64  `json:"baseVersion"`
	Data        string `json:"data"`
}

func TestSettingsRoundTripAndConflict(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	b := enrollDevice(t, h, makeInvite(t, admin, "B"))

	if rec := a.call("GET", "/settings/words", nil); rec.Code != 404 {
		t.Fatalf("empty server = %d %s", rec.Code, rec.Body)
	}
	one := wordsDoc(`"Wails":{"at":1,"del":false}`)
	rec := a.call("PUT", "/settings/words", settingBody{0, one})
	if rec.Code != 200 || version(t, rec) != 1 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	var got Setting
	if rec := b.call("GET", "/settings/words", nil); rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &got) != nil || got.Version != 1 || got.Data != one {
		t.Fatalf("other device reads = %d %s", rec.Code, rec.Body)
	}
	// b writes on top, then a writes on its old base: 409 with the current copy
	two := wordsDoc(`"Wails":{"at":1,"del":false},"Harper":{"at":2,"del":false}`)
	if rec := b.call("PUT", "/settings/words", settingBody{1, two}); rec.Code != 200 || version(t, rec) != 2 {
		t.Fatalf("update = %d %s", rec.Code, rec.Body)
	}
	rec = a.call("PUT", "/settings/words", settingBody{1, one})
	var c struct {
		Current *Setting `json:"current"`
	}
	if rec.Code != 409 || json.Unmarshal(rec.Body.Bytes(), &c) != nil || c.Current == nil || c.Current.Version != 2 || c.Current.Data != two {
		t.Fatalf("stale base = %d %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Errorf("content type %q", ct)
	}
	// a base for a key that does not exist is a 409 without a copy
	if rec := a.call("PUT", "/settings/ignored", settingBody{5, wordsDoc("")}); rec.Code != 409 || strings.Contains(rec.Body.String(), `"current"`) {
		t.Errorf("base for a missing key = %d %s", rec.Code, rec.Body)
	}
}

func TestSettingsValidation(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	for name, c := range map[string]struct{ key, data string }{
		"not json":         {"words", "nope"},
		"wrong version":    {"words", `{"v":2,"items":{}}`},
		"no items":         {"words", `{"v":1}`},
		"a null item":      {"words", wordsDoc(`"a":null`)},
		"negative time":    {"words", wordsDoc(`"a":{"at":-1,"del":false}`)},
		"a phrase":         {"words", wordsDoc(`"two words":{"at":1,"del":false}`)},
		"a long word":      {"words", wordsDoc(`"` + strings.Repeat("a", 65) + `":{"at":1,"del":false}`)},
		"a hash with text": {"ignored", wordsDoc(`"abc":{"at":1,"del":false}`)},
		"an empty item":    {"words", wordsDoc(`"":{"at":1,"del":false}`)},
		"too many items":   {"words", wordsDoc(manyItems(maxSettingItems + 1))},
	} {
		if rec := a.call("PUT", "/settings/"+c.key, settingBody{0, c.data}); rec.Code != 422 {
			t.Errorf("%s = %d %s", name, rec.Code, rec.Body)
		}
	}
	if rec := a.call("PUT", "/settings/other", settingBody{0, wordsDoc("")}); rec.Code != 422 && rec.Code != 404 {
		t.Errorf("unknown key = %d", rec.Code)
	}
	if rec := a.call("PUT", "/settings/ignored", settingBody{0, wordsDoc(`"12345678901234567890":{"at":1,"del":true}`)}); rec.Code != 200 {
		t.Errorf("valid ignored list = %d %s", rec.Code, rec.Body)
	}
}

func manyItems(n int) string {
	items := make([]string, n)
	for i := range items {
		items[i] = fmt.Sprintf(`"w%d":{"at":1,"del":false}`, i)
	}
	return strings.Join(items, ",")
}

func TestSettingsNeedADevice(t *testing.T) {
	_, db := newDB(t)
	h, _ := setup(t, db)
	for _, m := range []string{"GET", "PUT"} {
		if rec := do(h, m, "/settings/words", "", nil); rec.Code != 401 {
			t.Errorf("%s without credentials = %d", m, rec.Code)
		}
	}
}

type failingSettings struct{ *store.Sync }

func (failingSettings) GetSetting(context.Context, int64, string) (store.Setting, error) {
	return store.Setting{}, http.ErrAbortHandler
}

func (failingSettings) PutSetting(context.Context, int64, string, int64, string) (store.Setting, error) {
	return store.Setting{}, http.ErrAbortHandler
}

func TestSettingRoutesHideStoreErrors(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, failingSettings{db})
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	for _, rec := range []*httptest.ResponseRecorder{
		a.call("GET", "/settings/words", nil),
		a.call("PUT", "/settings/words", settingBody{0, wordsDoc("")}),
	} {
		if rec.Code != 500 || strings.Contains(rec.Body.String(), "abort") {
			t.Errorf("store failure = %d %s", rec.Code, rec.Body)
		}
	}
}
