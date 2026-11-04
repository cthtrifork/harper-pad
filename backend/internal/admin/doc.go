// Package admin is the admin UI: handlers for the devices and enrollment pages, plus same-origin and CSRF protection.
// Templates and the vendored htmx live under web/ and are embedded. It does no authentication of its own and knows nothing
// about users: Cloudflare Access in front of the tunnel is the only login. Nothing in this package reads or writes notes.
// See docs/sync.md, "The admin UI".
package admin
