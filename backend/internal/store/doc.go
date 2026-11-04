// Package store holds all SQL of the backend, run through pgx against PostgreSQL: clients, docs, devices and invites. The
// embedded migrations in migrations/ are applied by harper-pad-sync at start, under an advisory lock. A write to a draft is one
// transaction with compare-and-set on the draft's version and updatedAt; there is no global change counter. Every query on
// account data filters on the client_id of the authenticated device. See docs/sync.md, "Server schema (PostgreSQL)".
package store
