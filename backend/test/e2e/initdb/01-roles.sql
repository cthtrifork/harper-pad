-- Runs once, as harper_sync, when the stack's PostgreSQL is first initialised. The admin role logs in with a client certificate
-- only (pg_hba.conf from certs.sh), so it has no password. The schema, with the grants to this role, is applied by
-- harper-pad-sync when it starts (internal/store/migrations).
CREATE ROLE harper_admin LOGIN;
