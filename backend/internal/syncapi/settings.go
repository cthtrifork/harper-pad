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
	maxSettingItems = 20000 // the app's dictionary holds 10,000 words; tombstones of removed words count too
	maxWordRunes    = 64
)

// Setting is one synced setting.
type Setting struct {
	Version int64  `json:"version" doc:"Compare-and-set counter: 1 on creation, +1 on each accepted write"`
	Data    string `json:"data" doc:"A JSON string, {\"v\":1,\"items\":{\"<item>\":{\"at\":<unix ms>,\"del\":<bool>}}}: per item the time of its last change and whether it was removed (a tombstone). The server stores it as it came; the devices merge it."`
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

// validateSetting checks the document of a setting: valid UTF-8, version 1, a bounded set of items, each with a time and a flag. A
// word is one short word without spaces or control characters; an ignored finding is its hash, digits only.
func validateSetting(key, data string) error {
	var b struct {
		V     int `json:"v"`
		Items map[string]*struct {
			At  int64 `json:"at"`
			Del bool  `json:"del"`
		} `json:"items"`
	}
	if !utf8.ValidString(data) || json.Unmarshal([]byte(data), &b) != nil || b.V != 1 || b.Items == nil || len(b.Items) > maxSettingItems {
		return errInvalid
	}
	for item, v := range b.Items {
		if v == nil || v.At < 0 || item == "" {
			return errInvalid
		}
		if key == "ignored" {
			if len(item) > 20 || strings.Trim(item, "0123456789") != "" {
				return errInvalid
			}
		} else if utf8.RuneCountInString(item) > maxWordRunes || strings.IndexFunc(item, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) }) >= 0 {
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
		OperationID: "getSetting", Method: http.MethodGet, Path: "/settings/{key}", Tags: []string{"settings"}, Security: security,
		Summary:     "Get one synced setting",
		Description: "`words` is the personal dictionary, `ignored` the hashes of Harper's ignore list. 404 until a device has stored one.",
		Errors:      append([]int{http.StatusNotFound}, errs...), Middlewares: secured,
	}, a.getSetting)

	conflict := huma.SchemaFromType(a.api.OpenAPI().Components.Schemas, reflect.TypeFor[settingConflict]())
	huma.Register(a.api, huma.Operation{
		OperationID: "putSetting", Method: http.MethodPut, Path: "/settings/{key}", Tags: []string{"settings"}, Security: security,
		Summary: "Write one synced setting (compare-and-set)",
		Description: "Accepted only if the stored version is `baseVersion` (0 for a key the server does not have). Otherwise nothing " +
			"changes and the 409 carries the current setting, so the device merges and writes again.",
		MaxBodyBytes: store.MaxSettingData + 4<<10,
		Errors:       append([]int{http.StatusRequestEntityTooLarge, http.StatusBadRequest}, errs...), Middlewares: secured,
		Responses: map[string]*huma.Response{
			"409": {Description: "The stored setting is not the base the write was made against", Content: map[string]*huma.MediaType{
				"application/problem+json": {Schema: conflict},
			}},
		},
	}, a.putSetting)
}

type getSettingInput struct {
	DPoP          string `header:"DPoP" doc:"DPoP proof"`
	Authorization string `header:"Authorization" doc:"DPoP <device token>"`
	Key           string `path:"key" enum:"words,ignored"`
}

type getSettingOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         *Setting
}

func (a *API) getSetting(ctx context.Context, in *getSettingInput) (*getSettingOutput, error) {
	dev, _ := DeviceFrom(ctx)
	s, err := a.store.GetSetting(ctx, dev.ClientID, in.Key)
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
	Key           string `path:"key" enum:"words,ignored"`
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
	if err := validateSetting(in.Key, in.Body.Data); err != nil {
		return nil, huma.Error422UnprocessableEntity("invalid setting")
	}
	s, err := a.store.PutSetting(ctx, dev.ClientID, in.Key, in.Body.BaseVersion, in.Body.Data)
	switch {
	case errors.Is(err, store.ErrSettingConflict):
		c := &settingConflict{Title: "Conflict", Status: http.StatusConflict, Detail: "the setting changed on the server"}
		if s.Key != "" {
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
