-- Schema of docs/sync.md, "Server schema (PostgreSQL)", applied by harper-pad-admin as harper_admin, which owns the tables. Times are
-- Unix milliseconds. Later changes are new files; one that changes rows of docs must lift the row security below for its own
-- statements, because the owner cannot see them either.

CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                                  -- 'schema_version'
);

CREATE TABLE clients (                                 -- client accounts: one row in v1
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT   NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE docs (
  client_id  BIGINT  NOT NULL REFERENCES clients (id),
  id         TEXT    NOT NULL CHECK (id ~ '^[0-9a-f]{32}$'),
  version    BIGINT  NOT NULL,
  created_at BIGINT  NOT NULL,
  updated_at BIGINT  NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE,
  data       TEXT    NOT NULL DEFAULT '' CHECK (octet_length(data) <= 8388608),
  PRIMARY KEY (client_id, id)
);

CREATE TABLE devices (
  id             TEXT   PRIMARY KEY,
  client_id      BIGINT NOT NULL REFERENCES clients (id),
  name           TEXT   NOT NULL,
  user_agent     TEXT   NOT NULL DEFAULT '',
  token_hash     BYTEA  NOT NULL UNIQUE,               -- SHA-256 of the device token
  key_thumbprint TEXT   NOT NULL,                      -- RFC 7638 thumbprint of the device's DPoP key, from the enrollment proof
  created_at     BIGINT NOT NULL,
  last_seen      BIGINT NOT NULL
);
CREATE INDEX devices_client_idx ON devices (client_id);

CREATE TABLE invites (
  token_hash  BYTEA  PRIMARY KEY,                      -- SHA-256 of the token in the enrollment URL fragment
  client_id   BIGINT NOT NULL REFERENCES clients (id),
  device_name TEXT   NOT NULL DEFAULT '',
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  used_at     BIGINT                                   -- NULL until spent
);

INSERT INTO meta (key, value) VALUES ('schema_version', '1');
INSERT INTO clients (name, created_at) VALUES ('default', (extract(epoch FROM now()) * 1000)::bigint);

-- harper_sync is the role of the public API: rows only, no DDL and no ownership. Each grant is what a query in internal/store/sync.go
-- needs, and nothing else; the draft routes add theirs in a later file.
GRANT SELECT ON schema_migrations TO harper_sync;       -- to know the schema is current before it reports ready
GRANT SELECT, INSERT ON devices TO harper_sync;         -- enrollment inserts, authentication looks up by token hash
GRANT UPDATE (last_seen) ON devices TO harper_sync;     -- and records that the device was seen
GRANT SELECT ON invites TO harper_sync;
GRANT UPDATE (used_at) ON invites TO harper_sync;       -- spending an invite
GRANT SELECT, INSERT, UPDATE ON docs TO harper_sync;    -- drafts are compare-and-set rows; a deletion is an update (a tombstone)

-- Row security keeps the notes out of the admin role's reach: FORCE applies it to the owner too, and the only policy is for
-- harper_sync, so harper_admin sees and writes no row of docs, whatever SQL the admin app runs. It is a seatbelt, not a wall: the
-- owner can still change policies (DDL), so whoever holds its credential can read notes (docs/sync.md, "Database access").
ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs FORCE ROW LEVEL SECURITY;
CREATE POLICY sync_rows ON docs FOR ALL TO harper_sync USING (true) WITH CHECK (true);
