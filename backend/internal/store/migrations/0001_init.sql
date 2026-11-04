-- Schema of docs/sync.md, "Server schema (PostgreSQL)". Applied by harper-pad-sync as the harper_sync role, which then owns the
-- tables. Times are Unix milliseconds. The admin role gets exactly the grants at the end: no access to docs or meta.

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
  id         TEXT   PRIMARY KEY,
  client_id  BIGINT NOT NULL REFERENCES clients (id),
  name       TEXT   NOT NULL,
  user_agent TEXT   NOT NULL DEFAULT '',
  token_hash BYTEA  NOT NULL UNIQUE,                   -- SHA-256 of the device token
  public_key TEXT   NOT NULL,                          -- the device's DPoP key (JWK)
  created_at BIGINT NOT NULL,
  last_seen  BIGINT NOT NULL
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

GRANT SELECT ON clients TO harper_admin;
GRANT SELECT, INSERT, DELETE ON invites TO harper_admin;
GRANT SELECT, DELETE ON devices TO harper_admin;
GRANT UPDATE (name) ON devices TO harper_admin;
