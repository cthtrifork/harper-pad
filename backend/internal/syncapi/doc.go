// Package syncapi holds the HTTP handlers and middleware of the sync API: enroll, list drafts, get a draft, put a draft and,
// in v2, the key bag. Middleware: bearer authentication, rate limiting, the CORS allowlist and request size limits.
// See docs/sync.md.
package syncapi
