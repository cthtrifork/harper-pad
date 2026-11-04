// Package pgtls builds the PostgreSQL connection configuration for client-certificate authentication and re-reads the
// certificate files when cert-manager renews them, so a renewal needs no restart. See docs/sync.md, "Database access".
package pgtls
