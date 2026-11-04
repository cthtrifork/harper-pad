// Package syncapi holds the HTTP handlers and middleware of the sync API: enroll, list draft states, get a draft and put a draft.
// Middleware: device token and DPoP proof checking, rate limiting, the CORS allowlist (Authorization, DPoP, Content-Type) and
// request size limits. See docs/sync.md.
package syncapi
