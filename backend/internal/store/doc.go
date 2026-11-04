// Package store holds all SQL of the backend, run through pgx against PostgreSQL: clients, docs, devices, invites and, in v2,
// the key bag. The embedded migrations in migrations/ are applied by harper-pad-sync at start, under an advisory lock. A
// write to a draft is one transaction with compare-and-set on the draft's version and updatedAt; there is no global change
// counter. See docs/sync.md, "Server schema (PostgreSQL)".
package store
