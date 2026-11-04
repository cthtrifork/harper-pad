// Package store holds all SQL of the backend, run through pgx against PostgreSQL: docs, devices, invites, the audit log
// and, in v2, the key bag. The embedded migrations in migrations/ are applied by harper-pad-sync at start, under an
// advisory lock. Writes take pg_advisory_xact_lock so the change counter stays in commit order. See docs/sync.md,
// "Server schema (PostgreSQL)".
package store
