package syncapi

import (
	"encoding/json"
	"slices"
	"strings"
	"testing"

	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

type settingBody struct {
	BaseVersion int64    `json:"baseVersion"`
	Words       []string `json:"words"`
	Ignored     []string `json:"ignored"`
}

// sb is a write on top of version base; the lists are never null, as the schema requires.
func sb(base int64, words []string, ignored ...string) settingBody {
	return settingBody{base, words, append([]string{}, ignored...)}
}

func TestSettingsRoundTripAndConflict(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	b := enrollDevice(t, h, makeInvite(t, admin, "B"))

	if rec := a.call("GET", "/settings", nil); rec.Code != 404 {
		t.Fatalf("empty server = %d %s", rec.Code, rec.Body)
	}
	rec := a.call("PUT", "/settings", sb(0, []string{"Wails"}, "42"))
	if rec.Code != 200 || version(t, rec) != 1 || rec.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	var got Setting
	if rec := b.call("GET", "/settings", nil); rec.Code != 200 || json.Unmarshal(rec.Body.Bytes(), &got) != nil ||
		got.Version != 1 || !slices.Equal(got.Words, []string{"Wails"}) || !slices.Equal(got.Ignored, []string{"42"}) {
		t.Fatalf("other device reads = %d %s", rec.Code, rec.Body)
	}
	// b writes on top, then a writes on its old base: 409 with the current copy
	if rec := b.call("PUT", "/settings", sb(1, []string{"Wails", "Harper"})); rec.Code != 200 || version(t, rec) != 2 {
		t.Fatalf("update = %d %s", rec.Code, rec.Body)
	}
	rec = a.call("PUT", "/settings", sb(1, []string{"Wails"}, "42"))
	var c struct {
		Current *Setting `json:"current"`
	}
	if rec.Code != 409 || json.Unmarshal(rec.Body.Bytes(), &c) != nil || c.Current == nil || c.Current.Version != 2 ||
		!slices.Equal(c.Current.Words, []string{"Wails", "Harper"}) || c.Current.Ignored == nil || len(c.Current.Ignored) != 0 {
		t.Fatalf("stale base = %d %s", rec.Code, rec.Body)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "application/problem+json") {
		t.Errorf("content type %q", ct)
	}
	// a, now on the current version, overwrites: the last write wins
	if rec := a.call("PUT", "/settings", sb(2, []string{"Wails"}, "42")); rec.Code != 200 || version(t, rec) != 3 {
		t.Errorf("overwrite = %d %s", rec.Code, rec.Body)
	}
}

func TestSettingsBaseForNothingIsAConflictWithoutACopy(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	if rec := a.call("PUT", "/settings", sb(5, []string{})); rec.Code != 409 || strings.Contains(rec.Body.String(), `"current"`) {
		t.Errorf("base for a missing row = %d %s", rec.Code, rec.Body)
	}
}

func TestSettingsShape(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	for name, body := range map[string]string{
		"no lists":         `{"baseVersion":0}`,
		"no ignored":       `{"baseVersion":0,"words":[]}`,
		"null words":       `{"baseVersion":0,"words":null,"ignored":[]}`,
		"words not a list": `{"baseVersion":0,"words":"Wails","ignored":[]}`,
		"not strings":      `{"baseVersion":0,"words":[1],"ignored":[]}`,
	} {
		if rec := a.call("PUT", "/settings", json.RawMessage(body)); rec.Code != 422 {
			t.Errorf("%s = %d %s", name, rec.Code, rec.Body)
		}
	}
	// an empty dictionary is valid: someone may have removed every word
	if rec := a.call("PUT", "/settings", sb(0, []string{})); rec.Code != 200 {
		t.Errorf("empty lists = %d %s", rec.Code, rec.Body)
	}
}

func TestSettingsOverTheSizeLimitAre413(t *testing.T) {
	admin, db := newDB(t)
	h, _ := setup(t, db)
	a := enrollDevice(t, h, makeInvite(t, admin, "A"))
	if rec := a.call("PUT", "/settings", sb(0, []string{strings.Repeat("a", store.MaxSettingData)})); rec.Code != 413 {
		t.Errorf("over the limit = %d", rec.Code)
	}
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
