// Package pgtest connects tests to the PostgreSQL of the end-to-end stack (backend/test/e2e), which `make test-db` starts.
package pgtest

import (
	"os"
	"testing"
)

// Login points the libpq variables at the stack's PostgreSQL as one role: TLS 1.3 and that role's client certificate, no password,
// the way the cluster configures the services (docs/sync.md, "Database access"). store.Open("") reads them. The certificates are
// copied out of the stack's volume by `make test-db`; the test is skipped when TEST_PG_CERTS is not set.
func Login(t *testing.T, role, cert string) {
	t.Helper()
	dir := os.Getenv("TEST_PG_CERTS")
	if dir == "" {
		t.Skip("TEST_PG_CERTS is not set: run `make test-db` in backend/")
	}
	port := os.Getenv("TEST_PG_PORT")
	if port == "" {
		port = "15432"
	}
	for k, v := range map[string]string{
		"PGHOST": "localhost", "PGPORT": port, "PGDATABASE": "harper", "PGUSER": role, "PGSSLMODE": "verify-full",
		"PGSSLROOTCERT": dir + "/ca.crt", "PGSSLCERT": dir + "/" + cert + ".crt", "PGSSLKEY": dir + "/" + cert + ".key",
		"PGPASSWORD": "", "DATABASE_URL": "",
	} {
		t.Setenv(k, v)
	}
}
