-- Runs once, as the bootstrap superuser, when the stack's PostgreSQL is first initialised. This is what the cluster does in production
-- (CloudNativePG managed roles and the database owner). Both roles log in with a client certificate only (pg_hba.conf from certs.sh),
-- so they have no password.
--   harper_admin  owns the database and so the tables; harper-pad-admin applies the schema migrations as this role.
--   harper_sync   the public API's role: it gets only the row-level grants of the migrations (no DDL, no ownership).
-- The schema itself is made by harper-pad-admin when it starts (internal/store/migrations).
CREATE ROLE harper_admin LOGIN;
CREATE ROLE harper_sync LOGIN;
ALTER DATABASE harper OWNER TO harper_admin;
