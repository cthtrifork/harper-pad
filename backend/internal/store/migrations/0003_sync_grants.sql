-- harper_admin owns the tables and runs the migrations (docs/sync.md, "Database access"); harper_sync, the role of the public API, gets
-- rows only and no DDL. Each grant is what a query in internal/store/sync.go needs, and nothing else: the draft routes add theirs in
-- their own migration.
GRANT SELECT ON schema_migrations TO harper_sync;       -- to know the schema is current before it reports ready
GRANT SELECT, INSERT ON devices TO harper_sync;         -- enrollment inserts, authentication looks up by token hash
GRANT UPDATE (last_seen) ON devices TO harper_sync;     -- and records that the device was seen
GRANT SELECT ON invites TO harper_sync;
GRANT UPDATE (used_at) ON invites TO harper_sync;       -- spending an invite
GRANT SELECT, INSERT, UPDATE ON docs TO harper_sync;    -- drafts are compare-and-set rows; a deletion is an update (a tombstone)
