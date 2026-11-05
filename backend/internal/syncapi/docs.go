package syncapi

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"strconv"
	"strings"

	"github.com/cthtrifork/harper-pad/backend/internal/protocol"
	"github.com/cthtrifork/harper-pad/backend/internal/store"
	"github.com/danielgtaylor/huma/v2"
)

// DocState is one entry of the draft list: a draft's state without its text.
type DocState struct {
	ID        string `json:"id" pattern:"^[0-9a-f]{32}$"`
	Version   int64  `json:"version" doc:"Per-draft counter: 1 on creation, +1 on each accepted write. Only for compare-and-set."`
	UpdatedAt int64  `json:"updatedAt" doc:"Unix ms, set by the device that saved the draft"`
	Deleted   bool   `json:"deleted" doc:"A tombstone"`
}

// Doc is one draft with its text.
type Doc struct {
	ID        string `json:"id" pattern:"^[0-9a-f]{32}$"`
	Version   int64  `json:"version"`
	CreatedAt int64  `json:"createdAt" doc:"Unix ms"`
	UpdatedAt int64  `json:"updatedAt" doc:"Unix ms"`
	Deleted   bool   `json:"deleted"`
	Data      string `json:"data" doc:"The draft as a JSON string, {\"v\":1,\"format\":\"markdown\",\"content\":\"...\"}; empty for a tombstone"`
}

// conflictBody is the body of a 409: a problem document that also carries the server's current copy, when it has one.
type conflictBody struct {
	Title   string `json:"title"`
	Status  int    `json:"status"`
	Detail  string `json:"detail"`
	Current *Doc   `json:"current,omitempty" doc:"The server's current copy of the draft; absent when the server has none"`
}

func (e *conflictBody) Error() string  { return e.Detail }
func (e *conflictBody) GetStatus() int { return e.Status }

// ContentType makes the body application/problem+json, as every other error of the API.
func (e *conflictBody) ContentType(ct string) string {
	if ct == "application/json" {
		return "application/problem+json"
	}
	return ct
}

func toDoc(d store.Doc) *Doc {
	return &Doc{ID: d.ID, Version: d.Version, CreatedAt: d.CreatedAt, UpdatedAt: d.UpdatedAt, Deleted: d.Deleted, Data: d.Data}
}

// etag is the validator of a draft: its state (updatedAt, deleted), as the design says. Only equality matters.
func etag(updatedAt int64, deleted bool) string {
	d := "0"
	if deleted {
		d = "1"
	}
	return `"` + strconv.FormatInt(updatedAt, 10) + `-` + d + `"`
}

// etagMatches reports whether an If-None-Match header lists the tag (weak validators compare equal here, RFC 9110 section 13.1.2).
func etagMatches(header, tag string) bool {
	for _, p := range strings.Split(header, ",") {
		p = strings.TrimPrefix(strings.TrimSpace(p), "W/")
		if p == tag || p == "*" {
			return true
		}
	}
	return false
}

func (a *API) registerDocs() {
	secured := huma.Middlewares{a.RequireDevice}
	errs := []int{http.StatusUnauthorized, http.StatusUnprocessableEntity}
	security := []map[string][]string{{"DPoP": {}}}

	huma.Register(a.api, huma.Operation{
		OperationID: "listDocs", Method: http.MethodGet, Path: "/docs", Tags: []string{"drafts"}, Security: security,
		Summary: "List the state of every draft",
		Description: "The states of the account's drafts without their text, tombstones included, in id order. Page with `after` " +
			"(the last id of the previous page) until a page has fewer than `limit` entries.",
		Errors: errs, Middlewares: secured,
	}, a.listDocs)

	huma.Register(a.api, huma.Operation{
		OperationID: "getDoc", Method: http.MethodGet, Path: "/docs/{id}", Tags: []string{"drafts"}, Security: security,
		Summary: "Get one draft",
		Description: "The draft with its text, or a tombstone. The `ETag` is the draft's `updatedAt` and `deleted`; `If-None-Match` " +
			"with the same tag returns 304.",
		Errors: append([]int{http.StatusNotFound}, errs...), Middlewares: secured,
	}, a.getDoc)

	putConflict := huma.SchemaFromType(a.api.OpenAPI().Components.Schemas, reflect.TypeFor[conflictBody]())
	huma.Register(a.api, huma.Operation{
		OperationID: "putDoc", Method: http.MethodPut, Path: "/docs/{id}", Tags: []string{"drafts"}, Security: security,
		Summary: "Write one draft (compare-and-set)",
		Description: "Accepted only if the stored draft has the `base` version and `updatedAt` (version 0 for an id the server does " +
			"not have). Otherwise nothing changes and the 409 carries the server's current copy. A deletion is `deleted: true` with " +
			"empty `data`; the server clears the text of a tombstone.",
		MaxBodyBytes: protocol.MaxBodyBytes,
		Errors:       append([]int{http.StatusRequestEntityTooLarge, http.StatusBadRequest}, errs...), Middlewares: secured,
		Responses: map[string]*huma.Response{
			"409": {Description: "The stored draft is not the base the write was made against", Content: map[string]*huma.MediaType{
				"application/problem+json": {Schema: putConflict},
			}},
		},
	}, a.putDoc)
}

type listDocsInput struct {
	DPoP          string `header:"DPoP" doc:"DPoP proof"`
	Authorization string `header:"Authorization" doc:"DPoP <device token>"`
	After         string `query:"after" pattern:"^([0-9a-f]{1,32})?$" doc:"List drafts whose id sorts after this one"`
	Limit         int    `query:"limit" minimum:"1" maximum:"1000" default:"500" doc:"Page size"`
}

type listDocsOutput struct {
	CacheControl string `header:"Cache-Control"`
	Body         []DocState
}

func (a *API) listDocs(ctx context.Context, in *listDocsInput) (*listDocsOutput, error) {
	dev, _ := DeviceFrom(ctx)
	limit := in.Limit
	if limit == 0 {
		limit = protocol.DefaultListLimit
	}
	rows, err := a.store.ListDocs(ctx, dev.ClientID, in.After, limit)
	if err != nil {
		return nil, serverError("list docs", err)
	}
	out := &listDocsOutput{CacheControl: "no-store", Body: make([]DocState, len(rows))}
	for i, r := range rows {
		out.Body[i] = DocState{ID: r.ID, Version: r.Version, UpdatedAt: r.UpdatedAt, Deleted: r.Deleted}
	}
	return out, nil
}

type getDocInput struct {
	DPoP          string `header:"DPoP" doc:"DPoP proof"`
	Authorization string `header:"Authorization" doc:"DPoP <device token>"`
	IfNoneMatch   string `header:"If-None-Match" doc:"The ETag of the state the device last synced"`
	ID            string `path:"id" pattern:"^[0-9a-f]{32}$"`
}

type getDocOutput struct {
	Status       int
	CacheControl string `header:"Cache-Control"`
	ETag         string `header:"ETag"`
	Body         *Doc
}

func (a *API) getDoc(ctx context.Context, in *getDocInput) (*getDocOutput, error) {
	dev, _ := DeviceFrom(ctx)
	d, err := a.store.GetDoc(ctx, dev.ClientID, in.ID)
	switch {
	case errors.Is(err, store.ErrDocNotFound):
		return nil, huma.Error404NotFound("not found")
	case err != nil:
		return nil, serverError("get doc", err)
	}
	tag := etag(d.UpdatedAt, d.Deleted)
	if etagMatches(in.IfNoneMatch, tag) {
		return &getDocOutput{Status: http.StatusNotModified, CacheControl: "no-store", ETag: tag}, nil
	}
	return &getDocOutput{Status: http.StatusOK, CacheControl: "no-store", ETag: tag, Body: toDoc(d)}, nil
}

type putDocInput struct {
	DPoP          string `header:"DPoP" doc:"DPoP proof"`
	Authorization string `header:"Authorization" doc:"DPoP <device token>"`
	ID            string `path:"id" pattern:"^[0-9a-f]{32}$"`
	Body          struct {
		Base struct {
			Version   int64 `json:"version" minimum:"0" doc:"The stored version the device saw; 0 when it believes the server has no such draft"`
			UpdatedAt int64 `json:"updatedAt" minimum:"0" doc:"The stored updatedAt the device saw"`
		} `json:"base"`
		CreatedAt int64  `json:"createdAt" minimum:"0" doc:"Unix ms"`
		UpdatedAt int64  `json:"updatedAt" minimum:"0" doc:"Unix ms"`
		Deleted   bool   `json:"deleted,omitempty" doc:"True to delete the draft; omitted means false"`
		Data      string `json:"data" doc:"The draft as a JSON string (see GET); empty when deleted"`
	}
}

type putDocOutput struct {
	CacheControl string `header:"Cache-Control"`
	ETag         string `header:"ETag"`
	Body         struct {
		Version int64 `json:"version" doc:"The draft's new version"`
	}
}

func (a *API) putDoc(ctx context.Context, in *putDocInput) (*putDocOutput, error) {
	dev, _ := DeviceFrom(ctx)
	b := &in.Body
	if b.Deleted {
		if b.Data != "" {
			return nil, huma.Error422UnprocessableEntity("a deleted draft has no data")
		}
	} else if err := protocol.ValidateData(b.Data); err != nil {
		if errors.Is(err, protocol.ErrTooLarge) {
			return nil, huma.NewError(http.StatusRequestEntityTooLarge, "draft too large")
		}
		return nil, huma.Error422UnprocessableEntity("invalid draft")
	}
	d, err := a.store.PutDoc(ctx, dev.ClientID, in.ID,
		store.DocBase{Version: b.Base.Version, UpdatedAt: b.Base.UpdatedAt},
		store.DocWrite{CreatedAt: b.CreatedAt, UpdatedAt: b.UpdatedAt, Deleted: b.Deleted, Data: b.Data})
	switch {
	case errors.Is(err, store.ErrConflict):
		c := &conflictBody{Title: "Conflict", Status: http.StatusConflict, Detail: "the draft changed on the server"}
		if d.ID != "" {
			c.Current = toDoc(d)
		}
		return nil, c
	case err != nil:
		return nil, serverError("put doc", err)
	}
	out := &putDocOutput{CacheControl: "no-store", ETag: etag(d.UpdatedAt, d.Deleted)}
	out.Body.Version = d.Version
	return out, nil
}
