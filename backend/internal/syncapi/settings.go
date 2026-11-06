package syncapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/cthtrifork/harper-pad/backend/internal/store"
	"github.com/danielgtaylor/huma/v2"
)

const (
	maxSettingItems = 20000 // per list; the app's dictionary holds 10,000 words
	maxWordRunes    = 64
)

// Setting is the synced settings of the account: the dictionary and the ignore list in one document.
type Setting struct {
	Version int64  `json:"version" doc:"Compare-and-set counter: 1 on creation, +1 on each accepted write"`
	Data    string `json:"data" doc:"A JSON string, {\"v\":1,\"words\":[\"<word>\"],\"ignored\":[\"<decimal hash>\"]}: the whole dictionary and ignore list as the last device to write left them. The server stores it as it came."`
}

// settingConflict is the body of a 409: a problem document that carries the server's current setting, when it has one.
type settingConflict struct {
	Title   string   `json:"title"`
	Status  int      `json:"status"`
	Detail  string   `json:"detail"`
	Current *Setting `json:"current,omitempty" doc:"The server's current setting; absent when the server has none"`
}

func (e *settingConflict) Error() string  { return e.Detail }
func (e *settingConflict) GetStatus() int { return e.Status }
func (e *settingConflict) ContentType(ct string) string {
	if ct == "application/json" {
		return "application/problem+json"
	}
	return ct
}

// validateSetting checks the document: valid UTF-8, version 1, a bounded list of words (each one short word without spaces or control
// characters) and a bounded list of ignored findings (each one its hash, digits only).
func validateSetting(data string) error {
	var b struct {
		V       int      `json:"v"`
		Words   []string `json:"words"`
		Ignored []string `json:"ignored"`
	}
	if !utf8.ValidString(data) || json.Unmarshal([]byte(data), &b) != nil || b.V != 1 || b.Words == nil || b.Ignored == nil ||
		len(b.Words) > maxSettingItems || len(b.Ignored) > maxSettingItems {
		return errInvalid
	}
	for _, w := range b.Words {
		if w == "" || utf8.RuneCountInString(w) > maxWordRunes || strings.IndexFunc(w, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
			return errInvalid
		}
	}
	for _, h := range b.Ignored {
		if h == "" || len(h) > 20 || strings.Trim(h, "0123456789") != "" {
			return errInvalid
		}
	}
	return nil
}

func (a *API) registerSettings() {
	secured := huma.Middlewares{a.RequireDevice}
	errs := []int{http.StatusUnauthorized, http.StatusUnprocessableEntity}
	security := []map[string][]string{{"DPoP": {}}}

	huma.Register(a.api, huma.Operation{
		OperationID: "getSettings", Method: http.MethodGet, Path: "/settings", Tags: []string{"settings"}, Security: security,
		Summary:     "Get the synced settings",
		Description: "The personal dictionary (`words`) and the hashes of Harper's ignore list (`ignored`) in one document. 404 until a device has stored it.",
		Errors:      append([]int{http.StatusNotFound}, errs...), Middlewares: secured,
	}, a.getSetting)

	conflict := huma.SchemaFromType(a.api.OpenAPI().Components.Schemas, reflect.TypeFor[settingConflict]())
	huma.Register(a.api, huma.Operation{
		OperationID: "putSettings", Method: http.MethodPut, Path: "/settings", Tags: []string{"settings"}, Security: security,
		Summary: "Write the synced settings (compare-and-set)",
		Description: "Accepted only if the stored version is `baseVersion` (0 when the server has none). Otherwise nothing " +
			"changes and the 409 carries the current settings. The server never merges: the last write wins.",
		MaxBodyBytes: store.MaxSettingData + 4<<10,
		Errors:       append([]int{http.StatusRequestEntityTooLarge, http.StatusBadRequest}, errs...), Middlewares: secured,
		Responses: map[string]*huma.Response{
			"409": {Description: "The stored settings are not the base the write was made against", Content: map[string]*huma.MediaType{
				"application/problem+json": {Schema: conflict},
			}},
		},
	}, a.putSetting)
}

type getSettingInput struct {
	DPoP          string `header:"DPoP" doc:"DPoP proof"`
	Authorization string `header:"Authorization" doc:"DPoP <device token>"`
}

type getSettingOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *Setting
}

func (a *API) getSetting(ctx context.Context, in *getSettingInput) (*getSettingOutput, error) {
	dev, _ := DeviceFrom(ctx)
	s, err := a.store.GetSetting(ctx, dev.ClientID)
	switch {
	case errors.Is(err, store.ErrSettingNotFound):
		return nil, huma.Error404NotFound("not found")
	case err != nil:
		return nil, serverError("get setting", err)
	}
	return &getSettingOutput{CacheControl: "no-store", Body: &Setting{Version: s.Version, Data: s.Data}}, nil
}

type putSettingInput struct {
	DPoP          string `header:"DPoP" doc:"DPoP proof"`
	Authorization string `header:"Authorization" doc:"DPoP <device token>"`
	Body          struct {
		BaseVersion int64  `json:"baseVersion" minimum:"0" doc:"The stored version the device saw; 0 when it believes the server has none"`
		Data        string `json:"data" doc:"See GET"`
	}
}

type putSettingOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         struct {
		Version int64 `json:"version" doc:"The setting's new version"`
	}
}

func (a *API) putSetting(ctx context.Context, in *putSettingInput) (*putSettingOutput, error) {
	dev, _ := DeviceFrom(ctx)
	if err := validateSetting(in.Body.Data); err != nil {
		return nil, huma.Error422UnprocessableEntity("invalid setting")
	}
	s, err := a.store.PutSetting(ctx, dev.ClientID, in.Body.BaseVersion, in.Body.Data)
	switch {
	case errors.Is(err, store.ErrSettingConflict):
		c := &settingConflict{Title: "Conflict", Status: http.StatusConflict, Detail: "the settings changed on the server"}
		if s.Version != 0 {
			c.Current = &Setting{Version: s.Version, Data: s.Data}
		}
		return nil, c
	case errors.Is(err, store.ErrSettingTooLarge):
		return nil, huma.NewError(http.StatusRequestEntityTooLarge, "setting too large")
	case err != nil:
		return nil, serverError("put setting", err)
	}
	out := &putSettingOutput{CacheControl: "no-store"}
	out.Body.Version = s.Version
	return out, nil
}
