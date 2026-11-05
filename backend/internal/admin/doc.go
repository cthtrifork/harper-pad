// Package admin is the admin UI: the single page (add a device, pending enrollment URLs, devices) plus same-origin and CSRF
// protection. It does no authentication of its own: Cloudflare Access in front of the tunnel is the only login.
// See docs/sync.md, "The admin UI". The pages reach the database only through the Store interface.
package admin
