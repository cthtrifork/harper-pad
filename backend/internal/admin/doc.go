// Package admin is the admin UI: handlers for the single page (add a device, pending enrollment URLs, devices), plus same-origin and CSRF protection.
// Templates and the vendored htmx live under web/ and are embedded. It does no authentication of its own and knows nothing
// about users: Cloudflare Access in front of the tunnel is the only login. Nothing in this package reads or writes notes.
// See docs/sync.md, "The admin UI".
//
// The pages talk to the database only through the Store interface. The real, PostgreSQL-backed Store comes with the server
// (docs/sync.md, build order); until then NewStubStore (every call fails with ErrNotImplemented) and NewDemoStore (in-memory,
// seeded, for looking at the UI) stand in for it.
package admin
