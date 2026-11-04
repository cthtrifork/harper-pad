package admin

import (
	"bytes"
	"context"
	"embed"
	"errors"
	"fmt"
	"html/template"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"
)

//go:embed web/templates web/static
var webFS embed.FS

const (
	// InviteTTL is how long an enrollment URL works (docs/sync.md, "Enrollment").
	InviteTTL = 15 * time.Minute
	// maxNameLen bounds a device name; the app shows it in a list and the server stores it as text.
	maxNameLen = 64
	// idleAfter is when a device that has not synced shows a grey dot instead of a green one.
	idleAfter = 14 * 24 * time.Hour
)

// Config is what the handler needs besides a Store.
type Config struct {
	// SyncURL is the sync service's public https origin; enrollment URLs are SyncURL + "/join#" + token.
	SyncURL string
	// Now is the clock; time.Now when nil.
	Now func() time.Time
}

// Handler is the admin UI as an http.Handler.
type Handler struct {
	store Store
	cfg   Config
	pages map[string]*template.Template
	mux   *http.ServeMux
}

// New builds the admin UI. It panics when an embedded template does not parse, which a test catches.
func New(store Store, cfg Config) http.Handler {
	if cfg.Now == nil {
		cfg.Now = time.Now
	}
	cfg.SyncURL = strings.TrimRight(cfg.SyncURL, "/")
	h := &Handler{store: store, cfg: cfg, pages: map[string]*template.Template{}}
	for _, page := range []string{"index", "error"} {
		h.pages[page] = template.Must(template.New("layout.html").Funcs(h.funcs()).
			ParseFS(webFS, "web/templates/layout.html", "web/templates/fragments.html", "web/templates/"+page+".html"))
	}

	static, err := fs.Sub(webFS, "web/static")
	if err != nil {
		panic(err)
	}
	h.mux = http.NewServeMux()
	h.mux.Handle("GET /static/", cached(http.StripPrefix("/static/", http.FileServerFS(static))))
	h.mux.HandleFunc("GET /{$}", h.index)
	h.mux.HandleFunc("GET /devices/{id}", h.deviceRow)
	h.mux.HandleFunc("GET /devices/{id}/edit", h.deviceEdit)
	h.mux.HandleFunc("PUT /devices/{id}", h.deviceRename)
	h.mux.HandleFunc("DELETE /devices/{id}", h.deviceRevoke)
	h.mux.HandleFunc("POST /invites", h.inviteCreate)
	h.mux.HandleFunc("DELETE /invites/{id}", h.inviteCancel)
	return protect(h.mux)
}

func cached(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "max-age=300")
		next.ServeHTTP(w, r)
	})
}

func (h *Handler) funcs() template.FuncMap {
	return template.FuncMap{
		"date":      func(t time.Time) string { return t.UTC().Format("2 Jan 2006") },
		"lastSeen":  func(t time.Time) string { return lastSeen(h.cfg.Now(), t) },
		"countdown": func(t time.Time) string { return countdown(h.cfg.Now(), t) },
		"millis":    func(t time.Time) int64 { return t.UnixMilli() },
		"idle":      func(t time.Time) bool { return t.IsZero() || h.cfg.Now().Sub(t) > idleAfter },
	}
}

// ---- view models ----

type page struct {
	CSRF      string
	Account   string
	Devices   []Device
	Pending   []Invite
	Error     string // a message for the user
	Form      string // device name typed into the form
	Result    *result
	EditDev   Device
	NameError string
}

type result struct {
	URL        string
	DeviceName string
	ExpiresAt  time.Time
}

type ctxToken struct{}

func withToken(r *http.Request, token string) context.Context {
	return context.WithValue(r.Context(), ctxToken{}, token)
}

func tokenOf(r *http.Request) string { s, _ := r.Context().Value(ctxToken{}).(string); return s }

// ---- handlers ----

func (h *Handler) index(w http.ResponseWriter, r *http.Request) {
	p, ok := h.listPage(w, r)
	if !ok {
		return
	}
	h.render(w, "index", p)
}

func (h *Handler) listPage(w http.ResponseWriter, r *http.Request) (page, bool) {
	p := h.base(r)
	return p, h.fill(w, r, &p)
}

// fill loads everything the page shows: the devices, the pending invites and the account name.
func (h *Handler) fill(w http.ResponseWriter, r *http.Request, p *page) bool {
	devs, err := h.store.Devices(r.Context())
	if err != nil {
		h.fail(w, r, err)
		return false
	}
	pending, err := h.store.PendingInvites(r.Context(), h.cfg.Now())
	if err != nil {
		h.fail(w, r, err)
		return false
	}
	p.Devices, p.Pending = devs, pending
	p.Account = h.accountName(r.Context())
	return true
}

func (h *Handler) deviceRow(w http.ResponseWriter, r *http.Request) {
	d, ok := h.findDevice(w, r)
	if !ok {
		return
	}
	p := h.base(r)
	p.EditDev = d
	h.fragment(w, "device-row", p)
}

func (h *Handler) deviceEdit(w http.ResponseWriter, r *http.Request) {
	d, ok := h.findDevice(w, r)
	if !ok {
		return
	}
	p := h.base(r)
	p.EditDev = d
	h.fragment(w, "device-edit", p)
}

func (h *Handler) deviceRename(w http.ResponseWriter, r *http.Request) {
	name, err := cleanName(r.PostFormValue("name"))
	p := h.base(r)
	if err != nil {
		d, ok := h.findDevice(w, r)
		if !ok {
			return
		}
		p.EditDev, p.NameError = d, err.Error()
		p.EditDev.Name = strings.TrimSpace(r.PostFormValue("name"))
		w.WriteHeader(http.StatusUnprocessableEntity)
		h.fragment(w, "device-edit", p)
		return
	}
	d, err := h.store.RenameDevice(r.Context(), r.PathValue("id"), name)
	if err != nil {
		h.fail(w, r, err)
		return
	}
	p.EditDev = d
	h.fragment(w, "device-row", p)
}

func (h *Handler) deviceRevoke(w http.ResponseWriter, r *http.Request) {
	if err := h.store.RevokeDevice(r.Context(), r.PathValue("id")); err != nil && !errors.Is(err, ErrNotFound) {
		h.fail(w, r, err) // an already revoked device just refreshes the list
		return
	}
	p, ok := h.listPage(w, r)
	if !ok {
		return
	}
	h.fragment(w, "devices-list", p)
}

func (h *Handler) inviteCreate(w http.ResponseWriter, r *http.Request) {
	p := h.base(r)
	p.Form = strings.TrimSpace(r.PostFormValue("name"))
	status := http.StatusOK
	name, err := cleanName(r.PostFormValue("name"))
	switch {
	case err != nil:
		p.NameError, status = err.Error(), http.StatusUnprocessableEntity
	default:
		accts, aerr := h.store.Accounts(r.Context())
		if aerr != nil {
			h.fail(w, r, aerr)
			return
		}
		if len(accts) != 1 {
			p.Error, status = "There is more than one client account, and this form cannot choose between them yet. No URL was created.", http.StatusConflict
			break
		}
		token, inv, cerr := h.store.CreateInvite(r.Context(), name, InviteTTL)
		if cerr != nil {
			h.fail(w, r, cerr)
			return
		}
		p.Result = &result{URL: h.cfg.SyncURL + "/join#" + token, DeviceName: name, ExpiresAt: inv.ExpiresAt}
		p.Form = ""
	}
	if !h.fill(w, r, &p) {
		return
	}
	w.Header().Set("Cache-Control", "no-store") // the page holds the one-time URL
	w.WriteHeader(status)
	if isHTMX(r) {
		h.fragments(w, p, "invite-result", "pending-oob")
		return
	}
	h.render(w, "index", p)
}

func (h *Handler) inviteCancel(w http.ResponseWriter, r *http.Request) {
	if err := h.store.CancelInvite(r.Context(), r.PathValue("id")); err != nil && !errors.Is(err, ErrNotFound) {
		h.fail(w, r, err)
		return
	}
	p := h.base(r)
	if !h.fill(w, r, &p) {
		return
	}
	h.fragment(w, "pending", p)
}

// ---- helpers ----

func isHTMX(r *http.Request) bool { return r.Header.Get("HX-Request") == "true" }

func (h *Handler) base(r *http.Request) page {
	return page{CSRF: tokenOf(r)}
}

// accountName is for the header badge; a failure here is not worth failing the page for.
func (h *Handler) accountName(ctx context.Context) string {
	accts, err := h.store.Accounts(ctx)
	switch {
	case err != nil || len(accts) == 0:
		return ""
	case len(accts) > 1:
		return "All accounts"
	}
	return accts[0].Name
}

func (h *Handler) findDevice(w http.ResponseWriter, r *http.Request) (Device, bool) {
	devs, err := h.store.Devices(r.Context())
	if err != nil {
		h.fail(w, r, err)
		return Device{}, false
	}
	for _, d := range devs {
		if d.ID == r.PathValue("id") {
			return d, true
		}
	}
	h.fail(w, r, ErrNotFound)
	return Device{}, false
}

// fail maps a Store error to a status. The cause of an unexpected one goes to the log, never to the page.
func (h *Handler) fail(w http.ResponseWriter, r *http.Request, err error) {
	status, msg := http.StatusInternalServerError, "Something went wrong. Check the logs of harper-pad-admin."
	switch {
	case errors.Is(err, ErrNotFound):
		status, msg = http.StatusNotFound, "That device or URL no longer exists."
	default:
		slog.Error("admin request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	}
	p := h.base(r)
	p.Error = msg
	w.Header().Set("Cache-Control", "no-store")
	if isHTMX(r) {
		// Show the message where the action was, without replacing the page: htmx does not swap error responses by
		// default, so admin.js listens for htmx:responseError and puts the text in #flash.
		w.Header().Set("HX-Retarget", "#flash")
		w.Header().Set("HX-Reswap", "innerHTML")
		w.WriteHeader(status)
		h.fragment(w, "flash", p)
		return
	}
	w.WriteHeader(status)
	h.render(w, "error", p)
}

// render writes a full page. Nothing the admin UI serves is cacheable: pages can carry a one-time URL.
func (h *Handler) render(w http.ResponseWriter, name string, p page) {
	w.Header().Set("Cache-Control", "no-store")
	h.execute(w, h.pages[name], "layout", p)
}

func (h *Handler) fragment(w http.ResponseWriter, name string, p page) {
	w.Header().Set("Cache-Control", "no-store")
	h.execute(w, h.pages["index"], name, p)
}

// fragments renders several named templates one after the other (a main fragment plus out-of-band ones).
func (h *Handler) fragments(w http.ResponseWriter, p page, names ...string) {
	var buf bytes.Buffer
	for _, n := range names {
		if err := h.pages["index"].ExecuteTemplate(&buf, n, p); err != nil {
			slog.Error("admin template", "name", n, "err", err)
			http.Error(w, "template error", http.StatusInternalServerError)
			return
		}
	}
	_, _ = w.Write(buf.Bytes())
}

// execute renders into a buffer first, so a template error is a clean 500 and not a half page.
func (h *Handler) execute(w http.ResponseWriter, t *template.Template, name string, data any) {
	var buf bytes.Buffer
	if err := t.ExecuteTemplate(&buf, name, data); err != nil {
		slog.Error("admin template", "name", name, "err", err)
		http.Error(w, "template error", http.StatusInternalServerError)
		return
	}
	if w.Header().Get("Content-Type") == "" {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
	}
	_, _ = w.Write(buf.Bytes())
}

// cleanName trims a device name and checks it: not empty, at most maxNameLen characters, valid UTF-8, no control characters.
func cleanName(s string) (string, error) {
	s = strings.TrimSpace(s)
	switch {
	case s == "":
		return "", errors.New("Enter a name.")
	case !utf8.ValidString(s) || strings.ContainsFunc(s, func(r rune) bool { return r < ' ' || r == 0x7f }):
		return "", errors.New("Use plain text only.")
	case utf8.RuneCountInString(s) > maxNameLen:
		return "", fmt.Errorf("Use at most %d characters.", maxNameLen)
	}
	return s, nil
}

// lastSeen is the "Last seen" cell: relative while recent, a date with the age once it is old.
func lastSeen(now, t time.Time) string {
	if t.IsZero() {
		return "never"
	}
	d := now.Sub(t)
	switch {
	case d < time.Minute:
		return "just now"
	case d < time.Hour:
		return fmt.Sprintf("%d min ago", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%d h ago", int(d.Hours()))
	case now.UTC().Add(-24*time.Hour).Format("2006-01-02") == t.UTC().Format("2006-01-02"):
		return "Yesterday, " + t.UTC().Format("15:04")
	case d < 14*24*time.Hour:
		return t.UTC().Format("2 Jan 2006, 15:04")
	}
	return fmt.Sprintf("%s (%d days ago)", t.UTC().Format("2 Jan 2006"), int(d.Hours()/24))
}

// countdown is "in m:ss" until t, or "expired". admin.js keeps it ticking in the browser.
func countdown(now, t time.Time) string {
	d := t.Sub(now)
	if d <= 0 {
		return "expired"
	}
	s := int(d.Seconds())
	return fmt.Sprintf("in %d:%02d", s/60, s%60)
}
