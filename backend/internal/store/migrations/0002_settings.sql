-- The synced settings (docs/sync.md, "Settings"): one row per account, compare-and-set on version like a draft. The server never reads
-- or merges `data`; the last device to write wins. Row security keeps it from the admin role, as for docs (0001_init.sql).

CREATE TABLE settings (
  client_id BIGINT PRIMARY KEY REFERENCES clients (id),
  version   BIGINT NOT NULL,
  data      TEXT   NOT NULL CHECK (octet_length(data) <= 1048576)
);

GRANT SELECT, INSERT, UPDATE ON settings TO harper_sync;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_rows ON settings FOR ALL TO harper_sync USING (true) WITH CHECK (true);
