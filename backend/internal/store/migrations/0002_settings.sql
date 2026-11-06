-- The synced settings (docs/sync.md, "Settings"): one row per account and key, compare-and-set on version like a draft. The server
-- never reads or merges `data`; the devices do. Row security keeps it from the admin role, as for docs (0001_init.sql).

CREATE TABLE settings (
  client_id BIGINT NOT NULL REFERENCES clients (id),
  key       TEXT   NOT NULL CHECK (key IN ('words', 'ignored')),
  version   BIGINT NOT NULL,
  data      TEXT   NOT NULL CHECK (octet_length(data) <= 1048576),
  PRIMARY KEY (client_id, key)
);

GRANT SELECT, INSERT, UPDATE ON settings TO harper_sync;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_rows ON settings FOR ALL TO harper_sync USING (true) WITH CHECK (true);
