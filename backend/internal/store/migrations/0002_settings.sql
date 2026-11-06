-- The synced settings (docs/sync.md, "Settings"): one row per account, compare-and-set on version like a draft. `words` is the personal
-- dictionary and `ignored` the decimal hashes of Harper's ignore list, each a JSON array of strings. The server never merges them: the last
-- device to write wins. Row security keeps them from the admin role, as for docs (0001_init.sql).

CREATE TABLE settings (
  client_id BIGINT PRIMARY KEY REFERENCES clients (id),
  version   BIGINT NOT NULL,
  words     JSONB  NOT NULL CHECK (jsonb_typeof(words) = 'array'),
  ignored   JSONB  NOT NULL CHECK (jsonb_typeof(ignored) = 'array'),
  CONSTRAINT settings_size CHECK (octet_length(words::text) + octet_length(ignored::text) <= 262144)
);

GRANT SELECT, INSERT, UPDATE ON settings TO harper_sync;

ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_rows ON settings FOR ALL TO harper_sync USING (true) WITH CHECK (true);
