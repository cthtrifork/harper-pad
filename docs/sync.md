# Sync (design)

An optional sync service so **notes** (scratch pad drafts) follow the user between the desktop app and the iPhone Home Screen
app. The server is described in the [backend README](../backend/README.md); this page is the design and the protocol the clients
follow. The client and the server are built.

## Goals and non-goals

Goals:

- The same drafts on the desktop app and the web app (the iPhone Home Screen app is the web build).
- Works offline: editing never waits for the network, and changes made offline are sent by the next save or by **Sync all**.
- **The device is the source of truth and the server is a supporting system.** If the whole backend is lost, syncing from a device
  rebuilds it ([The client is the source of truth](#the-client-is-the-source-of-truth)).
- Off by default. A user who never turns it on has no network use beyond today's update check, and the security page's
  "no server" statement stays true for them.
- Small to run: a Go sync service, a tiny Go + HTMX admin container and PostgreSQL, on the user's own domain.

Non-goals for v1:

- **Operating-system integrations.** No OS keyring, Credential Manager, TPM or similar on any platform. The desktop app keeps its
  device key where the web build keeps its own, so the sync code is the same everywhere.
- **Syncing settings.** The personal dictionary, the ignore list, text size and every other setting stay on the device. What
  syncs is notes. Settings can be added later ([Later](#later)).
- **End-to-end encryption.** The server can read drafts. The wire format keeps the draft as an opaque string, so an encryption
  design ([Option: end-to-end encryption](#option-end-to-end-encryption)) could be added without changing how docs are pushed and
  pulled. It is an option and is not planned.
- **More than one client account in v1.** A *client account* is the owner of a set of notes and devices. Everything the server
  stores carries a `client_id` and every device is bound to one, so a second account can be added later without reshaping the
  schema, but v1 has exactly one and nothing creates another. (In this document "the client" is still the app's sync code; the
  owner is always called the client account.)
- **Real-time collaboration or merging text.** Conflicts keep both versions; they are not merged.
- **Syncing files.** A draft's link to a file on disk stays on the device.

## The client is the source of truth

The server is a relay and a replica: it is what lets a second device have the same notes. Each device holds a complete copy and is
authoritative for it. These rules apply to every part of the design below, and where something else in this page seems to
conflict with them, they win.

1. **Local first.** Every read and write uses the device's own store; sync runs behind it. The app behaves the same with sync off,
   the server down or the token revoked, and a failed sync never blocks or loses an edit.
2. **Absence is not deletion.** Only an explicit tombstone deletes a draft. A doc that is missing on the server (a new server, a
   failed write) is something to **upload**, never something to remove locally.
3. **Sync never changes what the user is working on.** A pull never overwrites a draft that has unsent edits. In a conflict the
   local text keeps its id and the other version becomes a "conflicted copy" ([Conflicts](#conflicts)), so the open editor never
   changes under the user.
4. **The server cannot destroy local data.** Revoking a device, an invalid token, a server reset and "Sign out" all
   leave the local drafts in place; sync just stops.
5. **An empty server is just a server that receives uploads.** Every device holds a full copy and **Sync all** reconciles in both
   directions, so a lost or new server is repopulated by enrolling the devices and running Sync all; nothing in the client is
   special-cased for it.
6. **What only the server holds is disposable or re-creatable.** Devices and tokens (re-enroll) and tombstones
   are the only such things.
7. **The server never generates a secret that a device must keep private.** The device's DPoP key (and, in the
   [encryption option](#option-end-to-end-encryption), the data key, the recovery key and the passphrase) is made on the device
   with its own random generator and never sent to the server. The server creates only secrets it is meant to know: invite
   tokens and device tokens, which it stores as hashes.

What losing the whole server costs:

| Lost | Effect |
|---|---|
| Drafts | Nothing: rebuilt from the devices |
| Devices and tokens | Every device shows "Sign in again". Create one enrollment URL per device in the admin UI; local data is untouched |
| Tombstones | A draft deleted on one device while another was offline can **reappear** when that other device re-uploads. Harmless and rare: delete it again |

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Server | A new Go service, `harper-pad-sync`, as a Kubernetes Deployment behind a ClusterIP Service, exposed through the cluster's ingress | Small, one static binary; applies the same draft limits as the app, written separately (see Code layout) |
| Database | PostgreSQL run by the **CloudNativePG operator** in the same cluster, authenticated with **client certificates** (mTLS), no passwords | cert-manager issues and renews the certificates; the sync service and the admin UI each get their own certificate and a role: the public API's role gets rows only, and the admin's role owns the schema |
| Schema owner | **`harper_admin` owns the tables and applies the migrations**; `harper_sync`, the public API's role, gets rows only (no DDL, no ownership) | The sync API faces the internet and parses unauthenticated input, so it gets the least. The admin UI is reached only through the tunnel behind Cloudflare Access with OIDC and MFA. Row security (forced, a policy for `harper_sync` only) hides the notes from the admin role in ordinary SQL; the owner can still switch it off. The cost: a compromised admin process could read notes (it could already enroll a device that does), and sync waits for admin to migrate |
| API framework and proof check | The sync API is [Huma](https://huma.rocks) on the standard library's mux, so the routes and [openapi.yaml](openapi.yaml) come from the same Go types; DPoP proofs are checked by [go-dpop](https://github.com/AxisCommunications/go-dpop) with a ttlcache for replays | Less security code to own, and the description is regenerated, not hand-written. The proof is checked before the body is read; see [DPoP](#limiting-the-damage-of-a-stolen-device) |
| Admin | A separate tiny Go + HTMX container for enrollment URLs and device management, **reached only through a Cloudflare Tunnel behind Cloudflare Access with OIDC login** | No inbound port, and the app knows nothing about users or login (Cloudflare does all of it); keeps administration out of the public API. See the [admin UI](../backend/cmd/harper-pad-admin/README.md) for what this trusts |
| Hosting | Kubernetes. The sync API is exposed through the cluster's existing ingress on the user's own domain, with a Let's Encrypt certificate from cert-manager. Only the admin UI goes through a **Cloudflare Tunnel** (a `cloudflared` sidecar in its pod) | iOS trusts the certificate and sync traffic never passes through a third party; Cloudflare handles only the admin pages ([the admin README](../backend/cmd/harper-pad-admin/README.md#access)) |
| Web build | Stays on GitHub Pages (`harper.portableinfo.cloud`) | Already deployed; sync is a different origin, so CORS and the CSP change |
| Code layout | `backend/` in this repository, as its **own Go module that shares no code with the app**; the sync client stays in the frontend | The overlap is about 30 lines of draft rules, and a shared module or a single module costs more than writing them twice. The end-to-end test runs the real client against the real server, which is what catches drift. The release workflow gains two artifacts, the sync and admin images |
| Client accounts | One in v1, modelled as many: a `clients` table, a `client_id` on every row, and every device bound to one account | More accounts later need no schema change. No sharing between accounts, no user management in v1 |
| Client | One JavaScript sync client used by both builds, on top of `backend.js` (the modules are listed in [architecture](architecture.md#frontend)) | The web build has no Go side; one implementation means one set of bugs |
| Auth | One opaque, long-lived device token per device, **bound to a device key with DPoP** (a signed proof on every request); no refresh tokens | See [Authentication](#authentication) |
| Approving new devices | None. A new device needs no confirmation from an enrolled one; the operator creates one short-lived, single-use enrollment URL per device in the admin UI, and that is the approval | The invite is single use and expires in 15 minutes, the operator signs in through Access with MFA, and every device is listed and can be revoked, with a "new device enrolled" notice on the others. Confirmation on an enrolled device would add a flow and a way to get locked out (no enrolled device left) for little extra safety. See [the admin README](../backend/cmd/harper-pad-admin/README.md#access) |
| Stolen-token hardening | A device list with last-seen, revoking in the admin UI, and **DPoP**, which makes a token that leaks without its key useless but does not cover a copy of the device's own storage | See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device) |
| Encryption of content | None (TLS only). End-to-end encryption is an option, not planned | The server can read the notes; see [the option](#option-end-to-end-encryption) |
| Sync model | Per-draft sync on save, a check when a note opens, and a **Sync all** button in the drafts drawer (also run once after enrolling and when the app starts). No change feed, cursor, timer or server id | Much less to build and to get wrong; a lost or emptied server is repopulated by the same Sync all |
| Conflicts | Server-assigned versions; the local text keeps its id and the other version becomes a "conflicted copy" draft | Never loses text, no merge logic, the open editor never changes under the user |
| Source of truth | The device. The server can be rebuilt from any device | A supporting system must not be able to lose or destroy notes; see [the principles](#the-client-is-the-source-of-truth) |

## Server

The server side is built and documented next to the code: [backend](../backend/README.md) (components, database roles and access,
diagram), [harper-pad-sync](../backend/cmd/harper-pad-sync/README.md) (the API, DPoP, limits, deploying) and
[harper-pad-admin](../backend/cmd/harper-pad-admin/README.md) (the operator page, Cloudflare Access, enrolling a device). Each device
keeps its own full copy and works without the server; the server is plain storage with compare-and-set, and devices never compare
clocks (they only test two states for equality).

## Enrollment

Every device, including the first, enrolls the same way.

1. In the admin UI the operator names the device and picks **Add device**. It shows `https://sync.example.com/join#<token>` once. The token is 256
   random bits, valid for about 15 minutes and for one use, and is stored only as a hash. It is in the URL **fragment** so it is not
   sent in the request line and not written to access logs. The invite belongs to a client account (the only one in v1), and the
   device it enrolls is bound to that account for good.
2. On the device: open the **Sync chip** in the status bar, paste the URL and choose **Add this device**. The URL carries the server address and the token, so
   there is no separate server field.
3. The app generates a signing key pair whose private key never leaves the device ([DPoP](#limiting-the-damage-of-a-stolen-device)),
   and calls `POST /enroll` with the invite token, a device name and a DPoP proof signed by the new key (the proof carries the public
   key). It gets back a device token bound to that key. The invite is now spent.
4. The app stores the device token and runs the first sync ([First sync](#first-sync)).

Why paste instead of opening the link: on iPhone, a tapped link opens Safari, which has separate storage from the installed Home
Screen app, so the enrollment would land in the wrong place. Pasting inside the installed app avoids it. The URL is only a
convenient way to carry the address and token in one string; opening it in a browser shows a short "copy this into Harper Pad" page.

The device list and revoking live in the admin page only; the app has no device list (see [Decided not to build](#decided-not-to-build)).

## Authentication

After enrollment every request carries `Authorization: DPoP <device token>` and a `DPoP` proof signed with the device's key
([below](#limiting-the-damage-of-a-stolen-device)).

- The token is 256 bits from a cryptographic random source. The server stores only its SHA-256 (a fast hash is enough for a
  high-entropy secret) and looks it up in constant time.
- It is **per device** and revocable: the server keeps the name, creation time and last-seen time, and deleting the row makes the next
  request a 401.
- There is no refresh token. The server is the only verifier, so it can check every token and revoke immediately; short-lived
  tokens would add rotation, reuse detection and cross-tab races without improving anything, because the web build stores both
  tokens in the same place (IndexedDB).
- A token does not expire. It works until the device is revoked in the admin UI, and `last_seen` shows dormant devices so they can be
  revoked by hand. An automatic idle expiry was considered and dropped: it does not stop a token that is being used, and it would
  sign out a phone that is opened rarely.
- On a 401 the client stops syncing and shows "Sign in again", which goes back to **Add this device** with a new invite. This also
  covers iOS clearing a Home Screen app's storage.
- An `Authorization` header, not a cookie, so a page on another site cannot make the browser attach credentials (no CSRF).
- Bad tokens and bad invites get the same generic 401.

Revisit refresh tokens if the design gains multiple users, sharing, a third-party client, a native iOS app that can use the
Keychain, or an identity provider. The `Authorization` header and the DPoP proof are the same, so the change would be on the server.

### Limiting the damage of a stolen device

Three different attackers need different answers, and the design treats them separately.

| Attacker | What they have | What helps |
|---|---|---|
| **Copies the token** from a log, a proxy or a script, but cannot copy the key | The device token | **DPoP** (below): the token is useless without a fresh proof from the key |
| **Copies the device's own storage** (a disk image, a backup, a profile folder) | The token **and**, on a Chromium-based engine, a usable key | DPoP does **not** help here (see "What DPoP does not cover" below). Revocation, and disk encryption on the device |
| **Uses the unlocked device** (or script running in the page) | The token, the key, and the drafts themselves | Revocation and the strict CSP. Nothing else can stop a legitimate client being used, and its edits and deletions sync to the other devices; there is no server-side undo in v1 |

**Device list and revocation (cover all three):**

- **A device list** with name, created, last-seen, and the user agent, in the admin UI, where a device is also revoked.


**DPoP: a device-bound signing key.** The device proves it holds a key on every request, as in DPoP (Demonstrating Proof of
Possession, [RFC 9449](https://rfc-editor.org/rfc/rfc9449)). The one difference from the RFC is that the token is opaque and not a
JWT, so the binding to the key is kept in our database instead of in a `cnf.jkt` claim.

At enrollment the device generates an ECDSA P-256 key pair and calls `POST /enroll` with the invite and a DPoP proof signed by the
new key; the proof's header carries the public key as a JWK. The server checks the proof, spends the invite and stores the key's thumbprint on the
device row, which binds the token to it. It answers with the token and `token_type: "DPoP"`.

Every later request carries `Authorization: DPoP <device token>` and a `DPoP: <proof>` header. The proof is a JWT signed with ES256
by the device's key:

```
header   {"typ": "dpop+jwt", "alg": "ES256", "jwk": {the device's public key}}
payload  {"jti": "<random id>", "htm": "PUT", "htu": "https://sync.example.com/docs/<id>",
          "iat": <unix seconds>, "ath": "<base64url SHA-256 of the device token>"}
```

The server checks, as RFC 9449 section 4.3 lists: exactly one proof; `typ`, `alg` and a well-formed public `jwk`; the signature;
`htm` and `htu` equal to the request's method and URL (the server's URL has no query or fragment, and the proof's `htu` must not have one); `iat` within about 60 seconds of its clock;
`jti` not seen in that window (a small in-memory cache is enough at one replica); `ath` equal to the hash of the presented token;
and that the `jwk`'s thumbprint (RFC 7638) equals the one stored on the token's device row. The proof carries the key and its signature is verified against it, so the server stores only the thumbprint. A token copied without the key is then
useless.

**Differences from RFC 9449.** The proof is the RFC's; there is no OAuth server, so the token is an opaque random value issued by
`POST /enroll` (the invite is the grant) with the key binding stored on the `devices` row, not a JWT with `cnf.jkt`. There is one
long-lived token with no refresh, a 60 second `iat` window plus the `jti` cache instead of `DPoP-Nonce`, and every credential failure
is the same generic 401. Nothing outside the app consumes the standard; moving to the literal form would be a server-side change only.

Where the private key lives:

| Build | Key storage |
|---|---|
| Web (iPhone Home Screen app, browsers) | `crypto.subtle.generateKey` with `extractable: false`; **only the private `CryptoKey`** is stored in IndexedDB (storing a whole `CryptoKeyPair` is not needed; the iPhone test showed it is accepted there, but older WebKit rejected it); the public key goes to the server in the enrollment proof. `extractable: false` stops script from exporting the key bytes; it does not encrypt the key on disk |
| Desktop (Linux, Windows) | **The same as the web build.** The window is a webview (WebKitGTK on Linux, WebView2 on Windows), so the same WebCrypto key is created there and stored in the webview's IndexedDB. There is no OS keyring, Credential Manager, TPM or key file, and no Go signing method: the sync module is the same code everywhere. |

Where it is kept: the private key, the public JWK and the token are one record in the `kv` store (see [Changes to local storage](#changes-to-local-storage)).

Details that are easy to get wrong:

- **What DPoP does not cover.** `extractable: false` is an API rule, not a promise about the disk. **Tested on Chromium:** after a
  non-extractable key was generated on the live test page, the private key was present in plain form in the profile's IndexedDB
  files, and a signature made from that disk copy verified against the real public key. Chrome, Edge and the Windows WebView2 share
  that engine, so a copy of such a profile (a backup, a disk image, a copied folder) carries the token and a usable key together.
  On WebKit (the iPhone, Safari, the Linux WebKitGTK window) this has not been tested, and it is not known whether the stored key is
  wrapped. So DPoP defends against a token that leaks without its key (logs, a proxy, a script that copies the token), and not
  against a copy of the device's own storage. The defences for that are revoking the device and encrypting the device's disk
  (BitLocker, LUKS, the phone's own protection).
- **On desktop the key sits in the webview's profile folder,** next to the device token and the local database, so a copy of that
  folder carries both (see the first bullet), and the drafts themselves are plain text in the SQLite file. That is accepted: DPoP
  protects the server against a leaked token, not the machine against someone who can read its disk.
- **WebCrypto's ECDSA signature is already the JWS `ES256` format** (raw `r‖s`, 64 bytes), so the client needs no DER conversion and
  a JOSE library on the Go side can verify the proof directly. Go's `ecdsa.VerifyASN1` would reject it; use the two 32-byte integers
  with `ecdsa.Verify`, or the library.
- **Libraries do the proof check, not code in this repository.** [go-dpop](https://github.com/AxisCommunications/go-dpop) (on golang-jwt)
  checks the compact JWS, `typ`, the signature against the header `jwk`, `htm`, `htu`, `iat` within the window, and that `jti` and `iat`
  are present, as RFC 9449 section 4.3 lists, and gives the key's thumbprint. A `ttlcache` is the `jti` replay cache. The server adds only
  what neither does: ES256 only, no private key in the `jwk`, the `ath` hash of the device token, and the order (the proof is checked
  before the request body is read). The thumbprint is computed from the decoded key, so one key has one identity however its coordinates are spelled in base64url
  (tested).
- **Losing the key means re-enrolling.** If the browser or iOS clears storage, the server rejects the proof and the client shows
  "Sign in again", the same recovery as a revoked token. Call `navigator.storage.persist()` (`keepData()`) as the app already does.
- **Limits:** DPoP does not stop script running in the page, or someone using the unlocked device, because both can ask the key to
  sign. The RFC says the same. Only preventing XSS (the strict CSP in [security](security.md)) addresses the first, and revocation
  the second.
- **Checked** on an iPhone (4 and 5 November 2026, Safari tab and Home Screen app, throwaway page in PR #86): a non-extractable
  P-256 key is generated, only the private `CryptoKey` is stored in IndexedDB, `exportKey` is refused, signatures are raw `r||s`, and
  the key survived closing the app and 20.6 hours; `persist()` returned false. In Edge 156 on Windows the same checks pass and
  `persist()` is true. WebKitGTK (the Linux window) was not checked. Longer iPhone checks were dropped: a cleared key means
  "Sign in again".

**Not planned:** rotating the token on a schedule with reuse detection, and a separate refresh token. DPoP covers the leaked-token
case with no refresh race (two tabs, the service worker, a response lost when iOS suspends the app). Rotation with reuse detection
is the one measure here that would notice a copied profile being used (the second user of an old token trips the check), and it is
also the fallback if the key turns out to be cleared on iOS: issue a new token in a response once the old one is a day old, keep the
previous one valid for about 10 minutes, and revoke the device if the previous one is presented after that.

## Data model

### What syncs

| Item | Synced fields | Not synced |
|---|---|---|
| Draft | `id`, `created_at`, `updated_at`, `format`, `content` | `title`, `excerpt`, `tasks*` (derived, recomputed on save), `file_path`, `file_mtime` (belong to one device's disk) |

Everything else stays on the device: the personal dictionary, the ignore list, text size and the other settings. Only drafts sync.

Draft ids are already 16 bytes (6 of time, 10 random) as 32 hex characters (`internal/store/drafts.go`, `newID`), so devices
can create drafts offline without colliding.

### Server schema (PostgreSQL)

```sql
CREATE TABLE meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL                             -- 'schema_version'
);

CREATE TABLE clients (                            -- client accounts: one row in v1, inserted by the initial migration
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- client_id
  name       TEXT   NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE docs (
  client_id  BIGINT  NOT NULL REFERENCES clients (id),
  id         TEXT    NOT NULL CHECK (id ~ '^[0-9a-f]{32}$'),
  version    BIGINT  NOT NULL,                    -- per-draft counter: 1 on creation, +1 on each accepted write; only for compare-and-set
  created_at BIGINT  NOT NULL,                    -- the device's timestamps, Unix ms, as in the app
  updated_at BIGINT  NOT NULL,
  deleted    BOOLEAN NOT NULL DEFAULT FALSE,      -- a tombstone; data is cleared when this is set
  data       TEXT    NOT NULL DEFAULT '' CHECK (octet_length(data) <= 2097152),
  PRIMARY KEY (client_id, id)
);

CREATE TABLE devices (
  id         TEXT   PRIMARY KEY,
  client_id  BIGINT NOT NULL REFERENCES clients (id),
  name       TEXT   NOT NULL,
  user_agent TEXT   NOT NULL DEFAULT '',
  token_hash BYTEA  NOT NULL UNIQUE,              -- SHA-256 of the device token; it alone identifies the device and so its client account
  key_thumbprint TEXT NOT NULL,                   -- RFC 7638 thumbprint of the device's DPoP key, from the enrollment proof; every later proof must use that key
  created_at BIGINT NOT NULL,
  last_seen  BIGINT NOT NULL
);
CREATE INDEX devices_client_idx ON devices (client_id);

CREATE TABLE invites (
  token_hash  BYTEA  PRIMARY KEY,
  client_id   BIGINT NOT NULL REFERENCES clients (id),   -- the account the enrolled device is bound to
  device_name TEXT   NOT NULL DEFAULT '',         -- entered in the admin UI, copied to the device on enrollment
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL,
  used_at     BIGINT                              -- NULL until spent
);
```

The admin role owns the tables and sets the sync role's grants in the one initial migration (`0001_init.sql`); each grant is what a query
of the sync service needs; the grants on `docs` for the draft routes are in this file too, so they needed no later migration. Nothing had run an earlier version, so the whole initial schema
is one file:

```sql
GRANT SELECT ON schema_migrations TO harper_sync;     -- to know the schema is current before it reports ready
GRANT SELECT, INSERT ON devices TO harper_sync;       -- enrollment inserts, authentication looks up by token hash
GRANT UPDATE (last_seen) ON devices TO harper_sync;
GRANT SELECT ON invites TO harper_sync;
GRANT UPDATE (used_at) ON invites TO harper_sync;     -- spending an invite
GRANT SELECT, INSERT, UPDATE ON docs TO harper_sync;  -- a deletion is an update (a tombstone)
-- nothing on clients or meta, no DELETE, no DDL

ALTER TABLE docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE docs FORCE ROW LEVEL SECURITY;            -- applies to the owner (harper_admin) too
CREATE POLICY sync_rows ON docs FOR ALL TO harper_sync USING (true) WITH CHECK (true);   -- no policy for the admin: it sees no note
```

A later migration that changes *rows* of `docs` must lift the force for its own statements, because the owner cannot see them either.
`TRUNCATE` is not subject to row security, so the owner can still empty the table; backups are physical and are not affected.

How it is used:

- **The client account comes from the token, never from the request.** The server looks the device token up in `devices` and takes
  `client_id` from that row. The protocol has no `client_id` field, so a device cannot name another account, and every query on
  `docs`, `devices` and `invites` (and the `keybag` table of the encryption option, if it is ever built) has `client_id = <the device's>` in its `WHERE`. Devices never see the id.
- **Listing is one indexed query on the primary key:** `SELECT id, version, updated_at, deleted FROM docs WHERE client_id = $1 AND
  id > $2 ORDER BY id LIMIT $3`. Ids sort by creation, so it pages cleanly, and it carries no text.
- **A write is one transaction with compare-and-set:** lock the draft's row (`SELECT ... FOR UPDATE`), check that its version and
  `updated_at` equal the request's `base` (an id the server does not have is `base` 0 and is inserted), then write with
  `version + 1`. A mismatch changes nothing and returns the current row, which is the 409. There is no global counter and no
  cursor, so there is no commit-order problem and no advisory lock for writes; the row lock is enough.
- **Tombstones clear the text,** so a deleted note's content is not kept on the server. They are kept forever.
- **Spending an invite is one statement,** so two devices cannot use it at once:
  `UPDATE invites SET used_at = $now WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $now RETURNING client_id, device_name`;
  the new `devices` row copies the `client_id`. Deleting old invites is the admin service's job, not the public API's: creating an
  invite also deletes the ones that expired more than a day ago (in the same statement), so the sync service runs no background job
  and holds no purge code.
- **Revoking a device deletes its row.**
- **v1 has one client account,** inserted by the initial migration (`name` `default`). Nothing creates another: there is no endpoint
  for it and the admin UI has no action for it. Adding accounts later means an admin action to create one, an account selector next to
  the device name, and per-account operators.
- **Times are `BIGINT` Unix milliseconds,** matching the app and the device-supplied times.
- **The 2 MiB check** is the CHECK on `docs.data`, the server's only size limit (the API maps its refusal to 413 and only caps the request body at that size plus 4 KiB). It is a backstop. The app enforces the 1 MiB draft limit; 2 MiB leaves room for the JSON wrapper and a base64 envelope (the encryption option), which is 4/3 of the plaintext.

The server validates what the app validates: drafts at most 1 MiB of valid UTF-8, a known format, a strict id. All SQL uses `$1`-style parameters.

## Protocol

JSON over HTTPS. Every route except `/enroll` needs the device token and a DPoP proof. The server is plain storage with compare-and-set: it
assigns each draft a version, and it never merges, never makes copies and has no change feed. All the sync logic is in the device.

| Route | Purpose |
|---|---|
| `POST /enroll` | `{invite, deviceName}` with a DPoP proof signed by the new key. Returns `{deviceToken, token_type: "DPoP"}`. Spends the invite and binds the token to the proof's key. |
| `GET /docs?after=<id>&limit=<n>` | The state of every draft of the client account, **without text**: `[{id, version, updatedAt, deleted}]`, in id order and paged. Tombstones are included. |
| `GET /docs/<id>` | One draft with its text: `{id, version, createdAt, updatedAt, deleted, data}`, or 404 if the server has no such id. The `ETag` is the draft's `updatedAt` and `deleted`; `If-None-Match` returns 304 when they match. |
| `PUT /docs/<id>` | `{base: {version, updatedAt}, createdAt, updatedAt, deleted, data}`. Accepted only if the stored draft matches `base` (version 0 for an id the server does not have). 200 returns `{version}`; otherwise 409 returns the server's current copy. A deletion is `deleted: true` with empty `data`. |

- **A draft's state is the pair `(updatedAt, deleted)`.** `updatedAt` is set by the device that saved the draft, so it does not depend on the server's numbering, and two equal states are the
  same text. The device records the state it last synced for each draft, and "the
  server changed" means the server's state differs from that record. Only equality is tested, never order, so device clocks do not
  matter.
- **The routes are also described in [openapi.yaml](openapi.yaml)**, generated from the server's Go types (`make openapi` in `backend/`). Where it and this page disagree, one of them is wrong: fix it.
- **`version` is only for compare-and-set.** It is not used to order anything or to tell whether the server changed. `base` carries
  `updatedAt` too, so a write is checked against the exact state the device saw.
- **Every route needs a valid `DPoP` proof header** ([DPoP](#limiting-the-damage-of-a-stolen-device)), `/enroll` included, so CORS
  allows `Authorization`, `DPoP`, `Content-Type` and `If-None-Match`.
- **The limits** from [Server schema](#server-schema-postgresql) apply to a `PUT`; the server answers 413 or 422 and changes nothing.
  `data` of a live draft must be the app's blob (`{"v":1,"format":"markdown"|"text","content":"..."}`) and, in size, whatever the database's CHECK allows (2 MiB; the
  server has no other size check, a refusal comes back as 413, and the app enforces its own 1 MiB on the text); a tombstone must have empty `data`. A page of `GET /docs` is 500 drafts by default and at most 1000 (`limit`);
  a page shorter than the limit is the last. A 409 on a `PUT` carries `current`, the server's copy, unless the server has none.
- **Errors** are `application/problem+json` (`title`, `status`, `detail`). A credential failure (no or bad proof, a replayed proof, an
  unknown or revoked token, the wrong key, a wrong, spent or expired invite) is always `{"title":"Unauthorized","status":401,"detail":"unauthorized"}`:
  the same bytes whatever the cause. A body that is not JSON is a 400, a field that fails validation a 422, a body over the limit a 413.
  The proof is checked before the body is read, so a request without a valid proof gets the 401 whatever its body.

### When sync happens

There is no timer, no focus pull and no change feed. Sync happens at four moments, and all of them use the same decision table
([Conflicts](#conflicts)).

| Moment | What it does |
|---|---|
| **Save** | About 2 seconds after typing stops, the device pushes that one draft (`PUT`). An explicit Save (the button, Ctrl+S, also to a file) pushes at once and looks at the server again, so a "Newer on the server" marker is settled even when there was nothing new to save. Offline or on an error the draft stays *changed* and is sent by the next save or by Sync all. |
| **Delete** | The tombstone is pushed when the app's undo offer ends (it times out, is closed, or another toast replaces it), so a delete that is undone never reaches the server. A tombstone not yet sent is found by the next Sync all. |
| **Opening a note** | The local text shows at once. In the background the device asks for the draft with `If-None-Match`. If the server has a newer state, the draft is unchanged here and the user has not typed, it is swapped in with a short "Updated from the server" notice. Otherwise the local text is left alone and the note gets a "Newer on the server" marker, to be settled by Sync all or the next save. A 404 changes nothing. A tombstone for a draft that was changed here changes nothing either (the edit survives). A tombstone for a draft that was **not** changed here is never applied while the note is open: a **modal dialog**, "Deleted on another device", asks **Keep** (the draft is uploaded again on top of the tombstone) or **Remove** (it is removed here, the newest remaining draft is shown, and an **Undo** in the toast brings it back and uploads it). The person must choose: Escape does not close it, and the page behind it is inert. It opens when a note is opened, never while typing. Sync all, which skips the open draft, asks the same question. |
| **Sync all** | A button in the drafts drawer. It lists the state of every draft on the server and reconciles both ways. It also runs once after a device enrolls and when the app starts. |

A sync never blocks typing. The status bar shows "Synced", "Syncing", "N pending", "Offline" or "Sign in again". Sync all shows a
progress line and ends with a one-line summary such as "3 uploaded, 2 downloaded, 1 conflicted copy, 1 removed"; removals can be
undone with the app's delete-undo. A run is **idempotent**: it recomputes every decision from stored state, so an interrupted run
(a phone suspended partway) is just a partial one and the next run carries on. iOS has no background sync, which is why nothing
depends on one.

Saving a draft pushes `PUT /docs/{id}` with the base state. On 200 the device records the synced state; on 409 it applies the
[conflict rules](#conflicts) to the server's current copy, pushes its own text on top, and pushes any conflicted copy as a new draft;
offline or on an error the draft stays *changed* for the next save or Sync all. **Sync all** reads `GET /docs` (states, no text,
paged) and, per draft, uploads, downloads, makes a conflicted copy, removes with undo or pushes a tombstone, as the table below says.

### Conflicts

A conflict is settled **on the device**, by comparing, and only when it is not clearly just an update. For each draft the device
compares its own text now, the state it recorded at the last sync (the sync state, below) and the server's
current state. The same table applies to a save that comes back 409, to opening a note (where only the "newer there" row can apply
on its own) and to Sync all. **In the code it is one place**: `createSyncer` in `frontend/src/lib/syncRun.js` (the table itself is the pure
`decide` in `syncPlan.js`). Sync all is its `all()`, the push after a save is its `one(id)` and opening a note is its `open(id)`; a test (`syncOneEngine.test.js`) fails if
another module starts deciding or uploading drafts.

| This device | The server | What happens |
|---|---|---|
| Unchanged since the last sync | Unchanged since the last sync | Nothing. |
| Unchanged | A different, newer state | **Plain update:** download and apply it. No copy. |
| Changed | Unchanged | **Plain update:** upload it. No copy. |
| Changed | Changed, with the same text and format | Adopt the server's state. No copy. |
| Changed | Changed, with different text | **Conflict:** make a copy (below). |
| Changed | Deleted (tombstone) | The edit survives: upload it again. No copy. |
| Unchanged | Deleted (tombstone) | Remove it here, with undo. |
| Deleted here (pending delete) | Unchanged | Upload the tombstone. |
| Deleted here | Edited elsewhere | The edit survives: download it and drop the pending delete. |
| Has it | Has no copy and no tombstone | Upload it (absence is not deletion). |
| Does not have it | Has it, and there is no pending delete | Download it. |

"Changed" means the text's hash differs from the one in the sync state, not that the draft was touched, so typing something and then undoing it
is unchanged, and a newer server version applies as a plain update. Nothing in the table replaces changed text: a draft with unsent
edits is only ever uploaded, or kept next to the server's version as a copy.

**Editing a note that was deleted elsewhere.** A tombstone is a row like any other, with a `version` and an `updated_at`. The device
takes those as the server's current state and pushes its text with them as `base`, so the compare-and-set check passes and the row is
live again with the next version. The write needs no special case on the server, and the device that deleted the note gets it back
as a plain update at its next sync. If the device only learns of the tombstone from a 409 on its push, it retries the same way
with the `base` the 409 returned.

**The copy is created locally.** The server's different version is saved on this device as a **new draft** whose first line is
prefixed with "Conflicted copy" and the time. The device's own text keeps its id, because it is what the user may have open and be
typing in ([the principles](#the-client-is-the-source-of-truth), rule 3). The device then pushes its own text on top of the server's
version. The copy is an ordinary draft: it syncs like any other, so other devices receive the text under the original id and the copy
as a new draft. Nothing is lost, and the user decides which to keep and deletes the other. The server never makes copies and never
merges text. The user is told: a line beside the status chip, "Kept the server version as a copy", with an **Open copy** button, for about
twelve seconds (a conflict found by a save, by opening a note or by Sync all alike).

### First sync

When a device enrolls it runs **Sync all** once. That merges: it uploads the drafts the server lacks and downloads the ones the
device lacks. Merge cannot overwrite anything, because ids are unique, and there is no "replace local with the server's" choice,
because the server must not be able to discard what a device holds ([the principles](#the-client-is-the-source-of-truth), rule 4).
A user who wants a clean device deletes the drafts on it first, which is an ordinary delete.

## Changes to local storage

The groundwork, and the riskiest part, because it touches both storage engines. It changes nothing for a user who leaves sync off.

- **Sync state, in its own table.** `sync_state` (SQLite) and the `sync` object store (IndexedDB) hold one record per draft the
  server knows: `hash` (SHA-256 of the format and the text at the last sync, the same value on both sides, checked against
  `internal/store/testdata/contenthash.json`), `updated_at` and `deleted` (the server's state then) and `version` (the base of the
  next write). Nothing is added to the draft rows, and none of it is sent. With sync off the table stays empty.
- **No dirty flag and no tombstone record.** A draft is *changed* when its current hash differs from `hash` (or it has no state);
  the hash is computed when asked, never stored on the draft, so it cannot go stale. A delete is a state record with no draft and
  `deleted` false: a *pending delete*. `DeleteDraft` stays a plain delete, and the record goes to `deleted` true when the server
  accepts it. Undo (saving the id again with the same text) is then no change at all.
- **A way to apply remote changes without rewriting them.** `Save` sets `updated_at` to now and recomputes the summary, which is
  wrong for a pulled draft. `ApplyRemote` (and `ApplyRemoteDelete`) keep the server's timestamps and the file link, recompute the
  summary, run the same checks as `Save`, and record the state as synced in the same transaction.
- **Older builds keep working.** Both changes are additive: SQLite gets a table and `PRAGMA user_version` stays 2 (it is the
  compatibility level, raised only for a change an older build would misread or damage, so an older build still opens the file),
  and IndexedDB `DB_VERSION` goes to 3 with a new store (a build one version behind opens it as it is, see
  [pages](pages.md#changing-the-schema)). An older build ignores the state, and because state is in its own table or store, its
  rewrites cannot lose it; because changes and deletes are derived, what it saves or deletes is seen by the newer build. Tests run
  the previous build's statements against a database with sync state, and upgrade databases written by user_version 1 and 2.
  A build from before `#83` fails on the newer IndexedDB version instead of opening it; there is no way around that.
- **Device-local sync settings** (server URL, device token, device name and the device key) are one record, `sync-device`, in the
  existing `kv` object store of the app's IndexedDB (`lib/syncDevice.js`), on the web and on desktop alike, so there is no Go side, no table
  and no `DB_VERSION` change. They are kept apart from the app's own settings and never uploaded. A cleared webview profile loses the key
  and the token, which means "Sign in again"; the drafts are safe either way.
- New host calls go through `backend.js` with both implementations, as [pages](pages.md) requires. New Go service methods mean
  running `make bindings`.

## Security

This is a device-token model with DPoP key binding, transport security and no content encryption.

| Concern | Handling |
|---|---|
| Transport | HTTPS only, on a Let's Encrypt certificate (cert-manager) for the sync domain, terminated at the cluster's ingress, with HTTP redirected and HSTS set. The client refuses an `http:` server. |
| Who can read the data | The server and its operator; content is not end-to-end encrypted. Cloudflare is not in the sync path and sees only the admin UI. Protect the cluster with encrypted volumes and tight access to the namespace, and keep request bodies out of logs (the ingress access logs must not include bodies). The settings screen says this plainly. |
| Stolen device token | Revoke that device in the admin UI. DPoP makes a token that leaks without its key useless; a copy of the device's own storage is not covered (and on Chromium engines carries the key). The token grants only its client account's data. See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device). |
| Invite theft | One use, 15 minutes, hashed at rest, in the URL fragment. |
| Isolation between client accounts | The account is taken from the token's device row and never from the request; every query on account data filters on it; one account per server in v1, so it is a guard for the future. Before a second account is created, narrow the row security that already guards `docs` (its `sync_rows` policy for the sync role says `USING (true)` today) to the account, with a `SET LOCAL` of it per transaction (the sync role does not own the tables, so policies apply to it), and test that two accounts cannot see each other's drafts or devices. |
| Database access | TLS and client certificates only, no passwords; certificates issued and renewed by cert-manager; PostgreSQL reachable only from the sync and admin pods by NetworkPolicy; separate roles: the public API's sync role gets rows only, the admin role owns the schema, and row security keeps notes from the admin role's ordinary SQL ([backend README](../backend/README.md#overview)). |
| Cluster | Default-deny NetworkPolicies; the sync pods reachable only from the ingress controller; the admin pod has no Service and listens on loopback; hardened pods, no Kubernetes API token, images pinned by digest. |
| Admin UI | No Service and no listener outside its pod; reached only through a Cloudflare Tunnel sidecar behind Cloudflare Access with OIDC login and MFA at the identity provider. **The app does no authentication of its own**, so the Access policy is the only access control and the Cloudflare account and policy are part of the trust chain. In the app: same-origin checks, CSRF tokens and a strict CSP. Its database role owns the tables; row security hides the notes from ordinary SQL but not from DDL that switches it off, and admin access can also enroll a device, and **a device reads the notes** (v1). See the [admin UI](../backend/cmd/harper-pad-admin/README.md). |
| Guessing | 256-bit tokens and generic 401s on `/enroll` and on bad tokens; rate limiting, if any, is at the ingress (GitOps repository). |
| Cross-origin use | CORS allows exactly the Pages origin and the desktop app's webview origin (`CORS_ALLOWED_ORIGINS`, exact match), not `*`, and only the headers and methods the API uses. An origin that is not listed gets no CORS headers (a preflight is a 403) and is logged once, which is how the desktop webview's real origin is read off the server. `Authorization` and `DPoP` headers, not cookies. |
| Abuse and size | A body cap, the 2 MiB `CHECK` on a draft's text, and strict field formats. The server has no per-account quota and no limit on changes per request. |
| Content-Security-Policy | `connect-src` is `'self'`, plus the sync origin when the build sets `SYNC_ORIGIN`, and nothing else changes: the build setting `SYNC_ORIGIN` (an https origin, no path; a bad value fails the build), read by `frontend/vite.config.js` for both builds and passed by the Pages workflow from a repository variable. Unset, the policy is unchanged. See [security](security.md). |
| Token at rest on the client | On the web it is in IndexedDB, readable by any script on the origin, which the strict CSP (no inline scripts, no `eval`) is there to prevent. On desktop, for now, it is in the webview's IndexedDB as on the web (see [Changes to local storage](#changes-to-local-storage)), and never uploaded. Neither is encrypted, and the device key sits in the same profile as the token (no OS keyring, by design). On Chromium engines a copied profile carries a usable key as well as the token (tested); the other engines are not tested. The local drafts are plain text in any case. |
| Draft text from the server | Treated as untrusted data like any pasted text: never run, never put in the page as HTML, validated before it is stored. |

Not defended: a compromised device (it has the data, and can edit or delete notes with no server-side undo), a compromised server (it has the data; the [encryption option](#option-end-to-end-encryption) would leave it only
ciphertext), and traffic analysis (the server sees sizes and times).

## Decided not to build

Decided on 5 November 2026; each can be reopened:

- **A device list in the app.** The admin page already lists devices and revokes them, behind a stronger login. A revoke from inside the app
  would be authenticated by a device token alone, so one stolen device could revoke all the others.
- **Undo for what Sync all removes from drafts that are not open.** A delete already had its Undo on the device where it was made, and a
  removal of the open draft has Keep, Remove and Undo. Until another device runs Sync all, editing the draft there brings it back.
- **A pending count and a progress line on the chip.** Sync all takes a second or two for a normal number of drafts.
- **A committed end-to-end test of the sync flows.** The CI `e2e` job checks the stack itself (https, readiness, the web app, the database
  login), and the unit tests drive the real web store against a fake of the server's routes.
- **A "Newer on the server" marker on the drafts drawer's cards.** Sync all updates every draft that is not open.
- **A server operations page.** Running and backing up the server belongs to the cluster's GitOps repository, and the devices can rebuild a
  lost server.

## Option: end-to-end encryption

**An option, not planned.** The server would store only ciphertext, still as opaque `data` strings by id and version, so it needs
no new kind of server. Ids, versions, times, the deleted flag and blob sizes stay visible; search already runs on each device.

- **Keys:** one random 256-bit data key (DK) made on the first device; per-doc key `HKDF-SHA-256(DK, "harper-pad doc " + id)`;
  AES-256-GCM through WebCrypto, with the additional authenticated data `id|v|kid` so a blob cannot move to another doc.
- **Key bag** (one per client account, a `keybag` table with `GET` and `PUT /keys` using compare-and-set): the DK wrapped by a
  passphrase key (Argon2id, at least 32 MiB, 3 passes, 1 lane, in a worker; devices refuse weaker parameters) and by a generated
  160-bit recovery key. Every unlocked device keeps a local copy so it can re-create a lost server's key bag.
- **Envelope:** `{"v":2,"kid":"k1","n":"<nonce>","c":"<ciphertext+tag>"}`; the plaintext is the v1 blob plus a `rev` counter, and a
  device rejects a lower `rev` than it has seen (rollback detection, only for docs it has seen).
- **Limits:** a copied token gets ciphertext but can guess the passphrase offline; a thief with an unlocked device needs
  **Rotate key** after revocation; losing both the passphrase and the recovery key loses the notes.
- **On a device:** the DK is a non-extractable WebCrypto handle in IndexedDB, as for the device key.
- **Measured:** Argon2id (hash-wasm 4.12.0) took about 101, 107 and 218 ms at 32, 64 and 128 MiB on an iPhone Home Screen app.
- **Open:** which Argon2id WebAssembly package to pin (lazy-loaded), and device pairing as a third unlock method.

## Later

- **Syncing settings:** the dictionary (set union) and the ignore list; they need their own table and merge rules.
