# Sync (design)

Status: **proposal, not built.** This page describes an optional sync service so **notes** (the scratch pad drafts)
follow the user between the desktop app and the iPhone Home Screen app. Nothing here is in the code yet. When it is
built, this page becomes the reference and [storage](storage.md), [security](security.md) and [architecture](architecture.md)
get the matching changes (see [Documentation changes](#documentation-changes)).

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

- **Syncing settings.** The personal dictionary, the ignore list, text size and every other setting stay on the device. What
  syncs is notes. Settings can be added later ([Later](#later)).
- **End-to-end encryption.** In v1 the server can read drafts. The wire format keeps the draft as an opaque string, so v2
  ([v2: end-to-end encryption](#v2-end-to-end-encryption)) can add encryption without changing how docs are pushed and pulled.
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
   are the only such things; in v2 the key bag is also kept on each device.

What losing the whole server costs:

| Lost | Effect |
|---|---|
| Drafts | Nothing: rebuilt from the devices |
| Devices and tokens | Every device shows "Sign in again". Create one enrollment URL per device in the admin UI; local data is untouched |
| Tombstones | A draft deleted on one device while another was offline can **reappear** when that other device re-uploads. Harmless and rare: delete it again |
| v2 key bag | Re-uploaded from a device's local copy ([v2](#v2-end-to-end-encryption)) |

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Server | A new Go service, `harper-pad-sync`, as a Kubernetes Deployment behind a ClusterIP Service, exposed through the cluster's ingress | Small, one static binary; applies the same draft limits as the app, written separately (see Code layout) |
| Database | PostgreSQL run by the **CloudNativePG operator** in the same cluster, authenticated with **client certificates** (mTLS), no passwords | cert-manager issues and renews the certificates; the sync service and the admin UI each get their own certificate and a role, the admin one with least privilege |
| Admin | A separate tiny Go + HTMX container for enrollment URLs and device management, **reached only through a Cloudflare Tunnel behind Cloudflare Access with OIDC login** | No inbound port, and the app knows nothing about users or login (Cloudflare does all of it); keeps administration out of the public API. See [the admin UI](#the-admin-ui) for what this trusts |
| Hosting | Kubernetes. The sync API is exposed through the cluster's existing ingress on the user's own domain, with a Let's Encrypt certificate from cert-manager. Only the admin UI goes through a **Cloudflare Tunnel** (a `cloudflared` sidecar in its pod) | iOS trusts the certificate and sync traffic never passes through a third party; Cloudflare handles only the admin pages ([what this trusts](#what-this-trusts)) |
| Web build | Stays on GitHub Pages (`harper.portableinfo.cloud`) | Already deployed; sync is a different origin, so CORS and the CSP change |
| Code layout | `backend/` in this repository, as its **own Go module that shares no code with the app**; the sync client stays in the frontend | The overlap is about 30 lines of draft rules, and a shared module or a single module costs more than writing them twice. The end-to-end test runs the real client against the real server, which is what catches drift. The release workflow gains two artifacts, the sync and admin images |
| Client accounts | One in v1, modelled as many: a `clients` table, a `client_id` on every row, and every device bound to one account | More accounts later need no schema change. No sharing between accounts, no user management in v1 |
| Client | One JavaScript sync module used by both builds, on top of `backend.js` | The web build has no Go side; one implementation means one set of bugs |
| Auth | One opaque, long-lived bearer token per device, no refresh tokens | See [Authentication](#authentication) |
| Stolen-token hardening | v1: a device list with last-seen, and revoking in the admin UI. v1.1: a device-bound signing key | See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device) |
| Encryption of content | None in v1 (TLS only); end-to-end in v2 | Keeps the first version small; see [v2](#v2-end-to-end-encryption) |
| Sync model | Per-draft sync on save, a check when a note opens, and a **Sync all** button in the drafts drawer (also run once after enrolling and when the app starts). No change feed, cursor, timer or server id | Much less to build and to get wrong; a lost or emptied server is repopulated by the same Sync all |
| Conflicts | Server-assigned versions; the local text keeps its id and the other version becomes a "conflicted copy" draft | Never loses text, no merge logic, the open editor never changes under the user |
| Source of truth | The device. The server can be rebuilt from any device | A supporting system must not be able to lose or destroy notes; see [the principles](#the-client-is-the-source-of-truth) |

## Overview

```mermaid
flowchart LR
  subgraph clients["Devices: source of truth, each with a full local copy"]
    desktop["Desktop app<br/>Wails + Vue<br/>local SQLite"]
    pwa["iPhone Home Screen app (PWA)<br/>IndexedDB"]
  end
  pages["GitHub Pages<br/>static app code only,<br/>no user data"]
  operator(["Operator<br/>browser"])
  idp["OIDC identity provider<br/>with MFA"]
  cf["Cloudflare<br/>Tunnel + Access (OIDC)<br/>admin hostname only"]

  subgraph cluster["Kubernetes cluster"]
    cm["cert-manager<br/>database client certificates"]
    subgraph ns["Namespace harper-pad: default-deny NetworkPolicies"]
      subgraph apipod["Pod harper-pad-sync"]
        api["sync API<br/>ClusterIP Service,<br/>exposed by the cluster ingress"]
      end
      subgraph adminpod["Pod harper-pad-admin"]
        cfd["cloudflared sidecar<br/>outbound tunnel"]
        admin["admin UI: Go + HTMX<br/>listens on 127.0.0.1<br/>no login of its own"]
      end
      subgraph cnpg["CloudNativePG cluster"]
        pg[("PostgreSQL<br/>TLS + client-certificate auth")]
      end
    end
  end

  pwa -. "loads the app" .-> pages
  desktop -->|"https://sync.example.com<br/>bearer token"| api
  pwa -->|"https://sync.example.com<br/>bearer token, CORS: Pages origin"| api
  operator -->|"https://admin.example.com"| cf
  cf <-->|"OIDC login"| idp
  cf <-->|"outbound tunnel"| cfd
  cfd -->|"localhost"| admin
  api -->|"mTLS, role harper_sync"| pg
  admin -->|"mTLS, role harper_admin"| pg
  cm -. "client certificates" .-> api
  cm -. "client certificates" .-> admin
```

| Component | Runs as | Reachable from | Does |
|---|---|---|---|
| `harper-pad-sync` | Deployment and ClusterIP Service | The cluster's ingress only (NetworkPolicy) | The API: enroll, list, get and put drafts |
| `harper-pad-admin` | Deployment; the pod also runs a `cloudflared` sidecar | The admin hostname through Cloudflare, behind Access with OIDC login; listens on 127.0.0.1, so only the sidecar can connect | Creates enrollment URLs, lists, renames and revokes devices |
| PostgreSQL | CloudNativePG `Cluster` | Port 5432, only from the sync and admin pods (NetworkPolicy) | All server state; accepts only TLS connections with a valid client certificate |
| cert-manager | Cluster add-on | Nothing | Issues the database client certificates and the sync domain's TLS certificate |
| Cloudflare | External | The internet | Carries the admin tunnel and runs Access on the admin hostname. Not in the sync path |
| GitHub Pages | Static hosting | The internet | Serves the web app's code; holds no user data |

Each device keeps its own full copy (SQLite on desktop, IndexedDB in the browser) and works without the server. The sync module
pushes a draft when it is saved, checks the server when a note is opened, and reconciles everything on **Sync all**. The server is
plain storage with compare-and-set: it assigns a version to each draft and never merges, copies or orders anything across
drafts, so devices never compare clocks (they only test two states for equality).

### Database access

No workload has a database password. PostgreSQL requires TLS and a client certificate for every connection, and the clients
verify the server certificate (`sslmode=verify-full`, with the cluster's server CA mounted in each pod).

- **Certificates:** cert-manager issues one `Certificate` per role (usage `client auth`, common name equal to the role name) from
  an issuer whose CA is given to the cluster as `spec.certificates.clientCASecret`. With a custom client CA the cluster no longer
  holds the signing key, so the `kubectl cnpg certificate` helper cannot be used and cert-manager is the issuer. Each pod mounts
  its certificate Secret as a volume (not a `subPath`, so renewals reach the pod), and the app re-reads the files for new
  connections, so renewal needs no restart.
- **Authentication rules:** `spec.postgresql.pg_hba` requires `cert` for these roles over `hostssl`, and the roles have no
  password. The exact entries, their order relative to CloudNativePG's own defaults, and whether the common name must equal the
  role (otherwise a `pg_ident` map) are to be confirmed against the operator version in use; they are not verified here.
- **Network:** a NetworkPolicy lets only the sync pods and the admin pods reach port 5432 (plus what the
  operator itself needs).

| Role | Used by | Allowed |
|---|---|---|
| `harper_sync` | `harper-pad-sync` | Owns the tables and runs the migrations at start (including the grants to `harper_admin`); reads and writes `docs`, `meta` (and the key bag in v2), `devices` and `invites` |
| `harper_admin` | `harper-pad-admin` | `invites`: insert, select, delete; `devices`: select, update (rename), delete (revoke). **No access to `docs`**, so a compromised admin UI cannot read notes. No DDL, and it cannot change the schema |

### The admin UI

A small Go server rendering HTML with HTMX, in its own pod so the public API carries no administration code. It listens on
127.0.0.1, has no Service reachable from outside, and nothing routes to it except its own sidecar. It is reached through a
**Cloudflare Tunnel**: a `cloudflared` sidecar in the same pod makes an outbound-only connection to Cloudflare and forwards to
`http://localhost:<port>`, and a **Cloudflare Access** application in front of the tunnel makes the operator sign in with an OIDC
identity provider before any request reaches the pod. The sync API is not behind Cloudflare; the cluster's ingress serves it.

What it does: **create an enrollment URL** (the one action that needs to be easy), list devices with name, last-seen and user
agent, rename and revoke.
There are two pages: Devices and Enrollment. A mockup in the app's own design tokens, light and dark, is in
[`admin-ui-mockup.html`](admin-ui-mockup.html); open it in a browser. It reads the sync service's public address from its configuration, which is how it builds enrollment
URLs. It has no feature that reads or writes notes, which is why its database role has no access to them. In v1 there is one client
account, so **New enrollment URL** has no account selector, and the admin app refuses to create an invite if it finds more than
one client account, until a selector exists.

#### Login: Cloudflare Access with OIDC

The admin app has **no login, no sessions, no token verification and no idea who is using it.** Cloudflare does all of the
authentication:

- **An Access application** for `admin.example.com`, with the OIDC identity provider as its login method. MFA is enforced at the
  identity provider, the policy allows only your identity (an email or a group at the provider), and the session is short, for
  example a few hours. Who may reach the admin UI is decided there and nowhere else.
- **The only way to the app is the tunnel.** The app listens on 127.0.0.1, the pod has no Service and a NetworkPolicy allows no
  ingress to it, so a request can only arrive through the `cloudflared` sidecar, and the tunnel serves only the admin hostname.
- **Still needed inside the app, none of it about identity:** a same-origin check on every state-changing request (`Origin` and
  `Sec-Fetch-Site`) and a CSRF token, because Cloudflare's session is a cookie that a page on another site could otherwise ride; and
  the same strict Content-Security-Policy as the app (no inline scripts).
- **No record of who did what.** The app keeps no audit log. Cloudflare's own logs show who signed in and when, and the device
  list shows each device and when it was last seen.

#### What this trusts

- **Cloudflare terminates TLS for the admin hostname,** so it can see the admin pages, including the enrollment URL shown on
  the page. It is **not** in the sync path: note text and sync tokens go from the device to the cluster's ingress, never through Cloudflare. The
  enrollment invite is single use and expires in 15 minutes, and the device it enrolls appears in the device list, so a stolen
  invite is noticed, but not prevented. If the domain's DNS is on Cloudflare, set the sync hostname to **DNS only** (not proxied),
  or its traffic would pass through Cloudflare after all.
- **Admin access is the ability to enroll a device, and in v1 a device can read every note.** That the admin's database role cannot
  read notes does not make a compromised admin UI harmless. Whoever controls the operator's identity provider account, the
  Cloudflare account or the Access policy can create an invite and enroll their own device. So MFA at the identity provider and on
  the Cloudflare account are part of the security of the notes. Mitigations in this design: the "new device enrolled" notice on
  every device ([hardening](#limiting-the-damage-of-a-stolen-device)), and in v2 a new device also needs the passphrase or
  recovery key. A further option is to require approval of a new device on an already-enrolled one (open question).
- **The Access configuration is the whole of the admin UI's access control.** If the Access application or its policy is removed or
  loosened, or the tunnel's hostname is pointed at the app without an Access application, the admin UI is open to the internet
  and the app has no second check. The loopback listener and the NetworkPolicy keep every other route closed. Treat the
  Cloudflare account and the Access policy as part of the security of the notes, and review them like the database.

### Enrolling a device

```mermaid
sequenceDiagram
  actor Op as Operator
  participant CF as Cloudflare (Access + Tunnel)
  participant Admin as Admin UI (pod, localhost)
  participant DB as PostgreSQL
  participant Dev as Device
  participant API as Sync API
  Op->>CF: Open admin.example.com (OIDC login with MFA)
  CF->>Admin: Forward the request (Cloudflare has already authenticated the operator)
  Op->>CF: New enrollment URL (device name)
  CF->>Admin: Forward the request
  Admin->>DB: INSERT invite (token hash, expires in 15 min)
  Admin-->>Op: https://sync.example.com/join#35;token (shown once)
  Op->>Dev: Paste in Settings, Sync, Add this device
  Dev->>API: POST /enroll {invite, deviceName}
  API->>DB: Spend invite, INSERT device (token hash)
  API-->>Dev: device token
  Dev->>API: Sync all with the bearer token (GET /docs, PUT /docs/{id})
```

## Enrollment

Every device, including the first, enrolls the same way.

1. In the admin UI the operator picks **New enrollment URL**. It shows `https://sync.example.com/join#<token>` once. The token is 256
   random bits, valid for about 15 minutes and for one use, and is stored only as a hash. It is in the URL **fragment** so it is not
   sent in the request line and not written to access logs. The invite belongs to a client account (the only one in v1), and the
   device it enrolls is bound to that account for good.
2. On the device: Settings, Sync, **Add this device**, then paste the URL. The URL carries the server address and the token, so
   there is no separate server field.
3. The app generates nothing secret itself. It calls `POST /enroll` with the invite token and a device name and gets back a device
   token. The invite is now spent.
4. The app stores the device token and runs the first sync ([First sync](#first-sync)).

Why paste instead of opening the link: on iPhone, a tapped link opens Safari, which has separate storage from the installed Home
Screen app, so the enrollment would land in the wrong place. Pasting inside the installed app avoids it. The URL is only a
convenient way to carry the address and token in one string; opening it in a browser shows a short "copy this into Harper Pad" page.

States to design: sync off, paste the URL, error (invite expired or used, server unreachable, not HTTPS), first-sync
progress (merge only), and the device list with rename and revoke. Follow the [design cheat sheet](design-cheatsheet.html), keep transitions
short, and honour reduced motion.

## Authentication

After enrollment every request carries `Authorization: Bearer <device token>`.

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
- A bearer header, not a cookie, so a page on another site cannot make the browser attach credentials (no CSRF).
- Bad tokens and bad invites get the same generic 401 and are rate limited.

Revisit refresh tokens if the design gains multiple users, sharing, a third-party client, a native iOS app that can use the
Keychain, or an identity provider. The wire format (`Bearer`) is the same, so the change would be on the server.

### Limiting the damage of a stolen device

Two different attackers need different answers, and the design treats them separately.

| Attacker | What they have | What helps |
|---|---|---|
| **Copies the token** (a backup, a disk image, a dump of IndexedDB) but does not keep the device | The bearer token | A device-bound key (v1.1); revocation |
| **Uses the unlocked device** (or script running in the page) | The token, the key, and the drafts themselves | Revocation and the strict CSP. Nothing else can stop a legitimate client being used, and its edits and deletions sync to the other devices; there is no server-side undo in v1 (see [Later](#later)) |

**v1 (cheap, covers both):**

- **A device list** with name, created, last-seen, and the user agent, in the admin UI, where a device is also revoked.
- **A notice** (a banner on the next open of each device) when a device enrolls or is revoked.

**v1.1: a device-bound signing key (proof of possession, in the style of DPoP, RFC 9449).**

At enrollment the device generates an ECDSA P-256 key pair and sends the public key (JWK) with `POST /enroll`; the server stores it
on the device row. After that, every request carries the bearer token **and** a proof header:

```
Harper-Proof: <timestamp>.<nonce>.<signature>
```

The signature is over `method`, the request path, `timestamp`, `nonce` and the SHA-256 of the bearer token, made with the device's
private key. The server checks that the signature verifies against the stored public key, that `timestamp` is within about 60
seconds of its clock, and that the `nonce` has not been seen in that window (a small in-memory cache is enough for one user). A
copied token without the key is then useless.

Where the private key lives:

| Build | Key storage |
|---|---|
| Web (iPhone Home Screen app, browsers) | `crypto.subtle.generateKey` with `extractable: false`; **only the private `CryptoKey`** is stored in IndexedDB (a `CryptoKeyPair` cannot be stored); the public key is exported as a JWK and sent to the server |
| Desktop | The OS keyring where there is one; otherwise a file readable only by the user |

Details that are easy to get wrong:

- **WebCrypto's ECDSA signature is raw `r‖s` (64 bytes for P-256), not DER.** Go's `ecdsa.VerifyASN1` will reject it; the server must
  split it into two 32-byte integers and call `ecdsa.Verify`.
- **Losing the key means re-enrolling.** If the browser or iOS clears storage, the proof fails and the client shows "Sign in
  again", the same recovery as a revoked token. Call `navigator.storage.persist()` (`keepData()`) as the app already does.
- **Fallback during rollout:** a device enrolled without a key (v1) keeps working with the bearer token alone until the operator
  turns on `--require-proof`. The client re-enrolls to get a key.
- **Limits:** it does not stop script running in the page, or someone using the unlocked device, because both can ask the key to
  sign. The RFC says the same of DPoP. Only preventing XSS (the strict CSP in [security](security.md)) addresses the first, and
  revocation the second.
- **Not verified on iOS yet.** Storing and using a non-extractable key worked in a Chromium test, but it has not been run on
  WebKit or in an installed iPhone app. The iPhone check in `TODO.md` decides whether this step goes ahead as written.

**Not planned:** rotating the token on a schedule with reuse detection, and a separate refresh token. A device-bound key covers the
copied-token case better and has no refresh race (two tabs, the service worker, a response lost when iOS suspends the app). If the
key turns out not to work on iOS, rotation with reuse detection is the fallback: issue a new token in a response once the old
one is a day old, keep the previous one valid for about 10 minutes, and revoke the device if the previous one is presented after that.

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
  value TEXT NOT NULL                             -- 'schema_version', (v2) 'encrypted'
);

CREATE TABLE clients (                            -- client accounts: one row in v1, inserted by the first migration
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
  data       TEXT    NOT NULL DEFAULT '' CHECK (octet_length(data) <= 8388608),
  PRIMARY KEY (client_id, id)
);

CREATE TABLE devices (
  id         TEXT   PRIMARY KEY,
  client_id  BIGINT NOT NULL REFERENCES clients (id),
  name       TEXT   NOT NULL,
  user_agent TEXT   NOT NULL DEFAULT '',
  token_hash BYTEA  NOT NULL UNIQUE,              -- SHA-256 of the bearer token; it alone identifies the device and so its client account
  public_key TEXT   NOT NULL DEFAULT '',          -- v1.1: the device's signing key (JWK)
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

-- v2 only, in a later migration
CREATE TABLE keybag (
  client_id BIGINT PRIMARY KEY REFERENCES clients (id),  -- one key bag per client account
  version   BIGINT NOT NULL,                      -- compare-and-set
  data      TEXT   NOT NULL                       -- opaque JSON: wrapped data key, KDF parameters, check value
);
```

The sync role owns the tables and sets the admin role's grants in the migration:

```sql
GRANT SELECT ON clients TO harper_admin;              -- read only until there is account management
GRANT SELECT, INSERT, DELETE ON invites TO harper_admin;
GRANT SELECT, DELETE ON devices TO harper_admin;
GRANT UPDATE (name) ON devices TO harper_admin;       -- rename only
-- nothing on docs, meta or keybag
```

How it is used:

- **The client account comes from the token, never from the request.** The server looks the bearer token up in `devices` and takes
  `client_id` from that row. The protocol has no `client_id` field, so a device cannot name another account, and every query on
  `docs`, `devices`, `invites` and `keybag` has `client_id = <the device's>` in its `WHERE`. Devices never see the id.
- **Listing is one indexed query on the primary key:** `SELECT id, version, updated_at, deleted FROM docs WHERE client_id = $1 AND
  id > $2 ORDER BY id LIMIT $3`. Ids sort by creation, so it pages cleanly, and it carries no text.
- **A write is one transaction with compare-and-set:** lock the draft's row (`SELECT ... FOR UPDATE`), check that its version and
  `updated_at` equal the request's `base` (an id the server does not have is `base` 0 and is inserted), then write with
  `version + 1`. A mismatch changes nothing and returns the current row, which is the 409. There is no global counter and no
  cursor, so there is no commit-order problem and no advisory lock for writes; the row lock is enough.
- **Tombstones clear the text,** so a deleted note's content is not kept on the server. They are kept forever.
- **Spending an invite is one statement,** so two devices cannot use it at once:
  `UPDATE invites SET used_at = $now WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $now RETURNING client_id, device_name`;
  the new `devices` row copies the `client_id`. A
  periodic delete removes expired invites.
- **Revoking a device deletes its row.** The "new device added" banner comes from `created_at`.
- **v1 has one client account,** inserted by the first migration (`name` `default`). Nothing creates another: there is no endpoint
  for it and the admin UI has no action for it. Adding accounts later means an admin action to create one, an account selector in
  **New enrollment URL**, and per-account operators (see Later).
- **Times are `BIGINT` Unix milliseconds,** matching the app and the device-supplied times.
- **The 8 MiB check** is a backstop. The app enforces the 5 MB draft limit, and v2's base64 envelope is larger than the plaintext.

The server validates what the app validates: drafts at most 5 MB of valid UTF-8, a known format, a strict id. All SQL uses `$1`-style parameters.

## Protocol

JSON over HTTPS. Every route except `/enroll` needs the bearer token. The server is plain storage with compare-and-set: it
assigns each draft a version, and it never merges, never makes copies and has no change feed. All the sync logic is in the device.

| Route | Purpose |
|---|---|
| `POST /enroll` | `{invite, deviceName}` returns `{deviceToken}`. Spends the invite. |
| `GET /docs?after=<id>&limit=<n>` | The state of every draft of the client account, **without text**: `[{id, version, updatedAt, deleted}]`, in id order and paged. Tombstones are included. |
| `GET /docs/<id>` | One draft with its text: `{id, version, createdAt, updatedAt, deleted, data}`, or 404 if the server has no such id. The `ETag` is the draft's `updatedAt` and `deleted`; `If-None-Match` returns 304 when they match. |
| `PUT /docs/<id>` | `{base: {version, updatedAt}, createdAt, updatedAt, deleted, data}`. Accepted only if the stored draft matches `base` (version 0 for an id the server does not have). 200 returns `{version}`; otherwise 409 returns the server's current copy. A deletion is `deleted: true` with empty `data`. |

- **A draft's state is the pair `(updatedAt, deleted)`.** `updatedAt` is set by the device that saved the draft, so it does not depend on the server's numbering, and two equal states are the
  same text. The device records the state it last synced for each draft, and "the
  server changed" means the server's state differs from that record. Only equality is tested, never order, so device clocks do not
  matter.
- **`version` is only for compare-and-set.** It is not used to order anything or to tell whether the server changed. `base` carries
  `updatedAt` too, so a write is checked against the exact state the device saw.
- **The limits** from [Server schema](#server-schema-postgresql) apply to a `PUT`; the server answers 413 or 422 and changes nothing.

### When sync happens

There is no timer, no focus pull and no change feed. Sync happens at four moments, and all of them use the same decision table
([Conflicts](#conflicts)).

| Moment | What it does |
|---|---|
| **Save** | About 2 seconds after typing stops, the device pushes that one draft (`PUT`). Offline or on an error the draft stays *changed* and is sent by the next save or by Sync all. |
| **Delete** | The tombstone is pushed after the app's undo window, so a delete that is undone never reaches the server. |
| **Opening a note** | The local text shows at once. In the background the device asks for the draft with `If-None-Match`. If the server has a newer state, the draft is unchanged here and the user has not typed, it is swapped in with a short "Updated from the server" notice. Otherwise the local text is left alone and the note gets a "Newer on the server" marker, to be settled by Sync all or the next save. A tombstone or a 404 changes nothing while the note is open. |
| **Sync all** | A button in the drafts drawer. It lists the state of every draft on the server and reconciles both ways. It also runs once after a device enrolls and when the app starts. |

A sync never blocks typing. The status bar shows "Synced", "Syncing", "N pending", "Offline" or "Sign in again". Sync all shows a
progress line and ends with a one-line summary such as "3 uploaded, 2 downloaded, 1 conflicted copy, 1 removed"; removals can be
undone with the app's delete-undo. A run is **idempotent**: it recomputes every decision from stored state, so an interrupted run
(a phone suspended partway) is just a partial one and the next run carries on. iOS has no background sync, which is why nothing
depends on one.

**Saving a draft:**

```mermaid
sequenceDiagram
  actor U as User
  participant D as Device
  participant S as Sync API
  participant DB as PostgreSQL
  U->>D: Type in a draft
  D->>D: Save locally (the draft is now changed)
  Note over D: about 2 seconds without typing
  D->>S: PUT /docs/{id} with base state and text
  S->>DB: Write if the stored state still matches base (version + 1)
  alt base matches
    DB-->>S: new version
    S-->>D: 200 with the new version
    D->>D: Record the synced state (the draft is unchanged again)
  else somebody else changed it
    S-->>D: 409 with the server's current copy
    D->>D: Apply the conflict rules (same text adopts, different text makes a Conflicted copy)
    D->>S: PUT the local text on top of the server's version
    D->>S: PUT the Conflicted copy as a new draft
  else offline or an error
    D->>D: Keep the draft changed, the next save or Sync all retries
  end
```

**Opening a note:**

```mermaid
sequenceDiagram
  actor U as User
  participant D as Device
  participant S as Sync API
  U->>D: Open a note
  D-->>U: Show the local text at once
  D->>S: GET /docs/{id} with If-None-Match (state of the last sync)
  alt unchanged on the server
    S-->>D: 304
  else newer on the server
    S-->>D: 200 with the newer text
    alt the draft is unchanged here and the user has not typed
      D->>D: Apply it without touching its timestamps
      D-->>U: The text swaps in with an Updated from the server notice
    else the user already typed, or the draft is changed
      D-->>U: Keep the local text and mark Newer on the server
      Note over D,S: Sync all or the next save settles it
    end
  else the server has a tombstone or no copy
    S-->>D: 200 deleted, or 404
    Note over D: Nothing changes while the note is open
  end
  opt offline or an error
    D-->>U: The local text stays, nothing is shown
  end
```

**Sync all:**

```mermaid
sequenceDiagram
  actor U as User
  participant D as Device
  participant S as Sync API
  U->>D: Press Sync all (or the app starts, or a device just enrolled)
  D->>S: GET /docs (states without text, paged by id)
  S-->>D: id, version, updatedAt and deleted for every draft
  D->>D: Compare every draft with the state recorded at the last sync
  loop every draft that needs work
    alt changed here and unchanged there, or missing there
      D->>S: PUT /docs/{id} (upload)
    else newer there, or missing here
      D->>S: GET /docs/{id}
      S-->>D: the draft
      D->>D: Save it without touching its timestamps
    else changed on both sides with different text
      D->>S: GET /docs/{id}
      D->>D: Save the server version as a Conflicted copy
      D->>S: PUT the local text on top, and PUT the copy as a new draft
    else deleted there and unchanged here
      D->>D: Remove it, with undo
    else deleted here and unchanged there
      D->>S: PUT a tombstone
    end
  end
  D-->>U: Summary: 3 uploaded, 2 downloaded, 1 conflicted copy, 1 removed
```

### Conflicts

A conflict is settled **on the device**, by comparing, and only when it is not clearly just an update. For each draft the device
compares its own text now, the state it recorded at the last sync (`synced_hash` and the synced state, below) and the server's
current state. The same table applies to a save that comes back 409, to opening a note (where only the "newer there" row can apply
on its own) and to Sync all.

| This device | The server | What happens |
|---|---|---|
| Unchanged since the last sync | Unchanged since the last sync | Nothing. |
| Unchanged | A different, newer state | **Plain update:** download and apply it. No copy. |
| Changed | Unchanged | **Plain update:** upload it. No copy. |
| Changed | Changed, with the same text and format | Adopt the server's state. No copy. |
| Changed | Changed, with different text | **Conflict:** make a copy (below). |
| Changed | Deleted (tombstone) | The edit survives: upload it again. No copy. |
| Unchanged | Deleted (tombstone) | Remove it here, with undo. |
| Deleted here (tombstone pending) | Unchanged | Upload the tombstone. |
| Deleted here | Edited elsewhere | The edit survives: download it and drop the local tombstone. |
| Has it | Has no copy and no tombstone | Upload it (absence is not deletion). |
| Does not have it | Has it, and there is no local tombstone | Download it. |

"Changed" means the text's hash differs from `synced_hash`, not that the draft was touched, so typing something and then undoing it
is unchanged, and a newer server version applies as a plain update. Nothing in the table replaces changed text: a draft with unsent
edits is only ever uploaded, or kept next to the server's version as a copy.

**The copy is created locally.** The server's different version is saved on this device as a **new draft** whose first line is
prefixed with "Conflicted copy" and the time. The device's own text keeps its id, because it is what the user may have open and be
typing in ([the principles](#the-client-is-the-source-of-truth), rule 3). The device then pushes its own text on top of the server's
version. The copy is an ordinary draft: it syncs like any other, so other devices receive the text under the original id and the copy
as a new draft. Nothing is lost, and the user decides which to keep and deletes the other. The server never makes copies and never
merges text.

### First sync

When a device enrolls it runs **Sync all** once. That merges: it uploads the drafts the server lacks and downloads the ones the
device lacks. Merge cannot overwrite anything, because ids are unique, and there is no "replace local with the server's" choice,
because the server must not be able to discard what a device holds ([the principles](#the-client-is-the-source-of-truth), rule 4).
A user who wants a clean device deletes the drafts on it first, which is an ordinary delete.

## Changes to local storage

The groundwork, and the riskiest part, because it touches both storage engines. It changes nothing for a user who leaves sync off.

- **Tombstones.** `DeleteDraft` is a hard delete today (`DELETE FROM drafts`), so a deletion cannot be sent. Keep a small record of
  deleted ids that are pending upload, and remove it once the server has acknowledged it.
- **Per-draft sync state:** `synced_hash` (a hash of the text and format at the last sync), `synced_updated_at` and
  `synced_deleted` (the server's state for the draft at the last sync) and `server_version` (the base of the next write). A
  draft is *changed* when its current hash differs from `synced_hash`; the server *changed* when its state differs from the
  synced pair. All of these are local columns; none is sent.
- **A way to apply remote changes without rewriting them.** `Store.Save` always sets `updated_at` to now and recomputes the
  summary, which is right for typing but wrong for applying a pulled draft, whose timestamps must be kept and which must not be
  marked changed; it sets the synced state to what was applied. Add a separate store method for it, with the same validation.
- **Migrations.** SQLite `PRAGMA user_version` 2 to 3, and `DB_VERSION` for IndexedDB, both upgrading an old database in place
  and refusing a newer one as they do now. Update the shared fixtures so the Go and the frontend tests keep checking the same
  cases.
- **Device-local sync settings** (server URL, device token, device name) are kept apart from the app's own settings and are
  never uploaded. On desktop that is a separate table or key set; in the browser a separate IndexedDB key.
- New host calls go through `backend.js` with both implementations, as [pages](pages.md) requires. New Go service methods mean
  running `make bindings`.

## Security

This is a bearer-token model with transport security and no content encryption.

| Concern | Handling |
|---|---|
| Transport | HTTPS only, on a Let's Encrypt certificate (cert-manager) for the sync domain, terminated at the cluster's ingress, with HTTP redirected and HSTS set. The client refuses an `http:` server. |
| Who can read the data | The server and its operator; content is not encrypted until v2. Cloudflare is not in the sync path and sees only the admin UI. Protect the cluster with encrypted volumes and tight access to the namespace, and keep request bodies out of logs (the ingress access logs must not include bodies). The settings screen says this plainly. |
| Stolen device token | Revoke that device in the admin UI; from v1.1 a device-bound key makes a copied token useless. The token grants only its client account's data. See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device). |
| Invite theft | One use, 15 minutes, hashed at rest, in the URL fragment. |
| Isolation between client accounts | The account is taken from the token's device row and never from the request; every query on account data filters on it; one account per server in v1, so it is a guard for the future. Before a second account is created, consider PostgreSQL row-level security as a second layer (`FORCE ROW LEVEL SECURITY`, because the sync role owns the tables, and a `SET LOCAL` of the account per transaction), and test that two accounts cannot see each other's drafts or devices. |
| Database access | TLS and client certificates only, no passwords; certificates issued and renewed by cert-manager; PostgreSQL reachable only from the sync and admin pods by NetworkPolicy; separate roles for sync and admin, the admin one with least privilege ([Database access](#database-access)). |
| Cluster | Default-deny NetworkPolicies; the sync pods reachable only from the ingress controller; the admin pod has no Service and listens on loopback; hardened pods, no Kubernetes API token, images pinned by digest. |
| Admin UI | No Service and no listener outside its pod; reached only through a Cloudflare Tunnel sidecar behind Cloudflare Access with OIDC login and MFA at the identity provider. **The app does no authentication of its own**, so the Access policy is the only access control and the Cloudflare account and policy are part of the trust chain. In the app: same-origin checks, CSRF tokens and a strict CSP. Its database role cannot read notes, **but admin access can enroll a device, and a device reads the notes** (v1). See [the admin UI](#the-admin-ui). |
| Guessing | 256-bit tokens; rate limits and generic 401s on `/enroll` and on bad tokens. |
| Cross-origin use | CORS allows exactly the Pages origin and the desktop app's webview origin, not `*`, and only the headers and methods the API uses. Bearer headers, not cookies. |
| Abuse and size | Request and field limits as in the app, a per-server quota, and a limit on changes per request. |
| Content-Security-Policy | `connect-src` is `'self'` today. Add the sync origin only when sync is configured (a build-time setting for the web build; the desktop page is embedded, so it needs the origin in its policy too), and change nothing else. See [security](security.md). |
| Token at rest on the client | On the web it is in IndexedDB, readable by any script on the origin, which the strict CSP (no inline scripts, no `eval`) is there to prevent. On desktop it is in the local database, outside the app's other settings, and never uploaded. Neither is encrypted; there is no OS keyring in the web build. |
| Draft text from the server | Treated as untrusted data like any pasted text: never run, never put in the page as HTML, validated before it is stored. |

Not defended: a compromised device (it has the data, and can edit or delete notes with no server-side undo), a compromised server (it has the data in v1; in v2 it has only ciphertext,
see [v2](#v2-end-to-end-encryption)), and traffic analysis (the server sees sizes and times).

## Deploying the server

Everything runs in one Kubernetes namespace, `harper-pad`, described by manifests that live in the cluster's own
GitOps repository, not in this one (this section is their specification):

- **PostgreSQL:** a CloudNativePG `Cluster` with one instance to start (one user, and devices can rebuild the server, so high
  availability is not needed), the client CA and `pg_hba` settings above, and the certificates from cert-manager. The design makes
  no provision for backing it up or restoring it: every device holds a full copy, and a new empty server is repopulated by Sync all.
- **Migrations:** the sync service applies them itself at start, under its own role, taking a PostgreSQL advisory lock so that
  only one pod migrates if there is ever more than one replica. It refuses to start if the database has a newer schema than it
  knows. The admin service starts only against a schema it recognises, and does not migrate.
- **`harper-pad-sync`:** a Deployment (one replica to start) and a ClusterIP Service, with a single container. The ingress (Traefik)
  routes the sync domain to the Service (an `IngressRoute`, or a standard Ingress), with the TLS certificate from a cert-manager
  `Certificate` (Let's Encrypt) and these middlewares: redirect HTTP to HTTPS, HSTS and standard security headers, a rate limit
  per client IP, and a request body cap slightly above the largest allowed request. CORS stays in the app, with its explicit
  allowlist. The app takes the client IP from `X-Forwarded-For` only because the NetworkPolicy lets nothing but the ingress controller connect to
  it. The in-memory rate limiter and, from v1.1, the proof nonce cache are per pod, so move them to PostgreSQL before running
  more than one replica.
- **`harper-pad-admin`:** a Deployment (one replica) with **no Service**. The pod has the app container, listening on
  127.0.0.1, and a `cloudflared` sidecar (a native sidecar container where the cluster supports them, so the tunnel is up before
  the app and outlives it). The tunnel token is a Kubernetes Secret passed as `TUNNEL_TOKEN`; the tunnel is remotely managed and
  maps the admin hostname to `http://localhost:<port>` in Cloudflare. Cloudflare's own Kubernetes guide runs `cloudflared` as a
  separate Deployment pointing at Services; the sidecar is chosen so the admin app can listen on loopback only, which means no
  other pod can reach it. The cost is that the two scale and restart together.
- **NetworkPolicies:** default deny for ingress and egress in the namespace, then allow:
  - DNS, and the sync and admin pods to PostgreSQL on 5432;
  - ingress to the sync pods from the ingress controller's pods only, and none to the admin pod;
  - the admin pod out to Cloudflare for the tunnel (the ports Cloudflare documents);
  - nothing else out of the sync pods.

  The cluster's network plugin has to enforce NetworkPolicy.
- **Pod hardening:** non-root, read-only root filesystem, all capabilities dropped, the runtime-default seccomp profile, no
  Kubernetes API token (`automountServiceAccountToken: false`, because neither app talks to the Kubernetes API), resource limits, and
  images pinned by digest.
- **Configuration:** `PUBLIC_URL` must be `https:` or the service refuses to start. The ingress terminates TLS, so the app sees plain
  HTTP and takes the scheme from this setting, not from a forwarded header.
- **Health:** a liveness endpoint, and a readiness endpoint that checks the database connection.

Commands: `harper-pad-sync serve` and `harper-pad-admin serve`. Enrollment, devices and revoking are in the admin UI, not
on the command line.

## End-to-end test

A small test that runs the real pieces together, because only that proves the JavaScript sync client, CORS, the CSP, IndexedDB, TLS
and the server work as one. It is a Playwright script driving a real Chromium against a compose stack.

- **The stack:** a compose file with three services, built or pulled and started together:
  - **PostgreSQL**;
  - **`harper-pad-sync`**, built from its real Containerfile (`backend/Containerfile.sync`, with `Containerfile.admin` beside
    it), so the image, the listen address and the configuration guards are tested too;
  - **Caddy**, which provides HTTPS the way the cluster's ingress does in production.

  The compose file avoids features only Docker has, so `podman compose` and `docker compose` both run it; the `make` target uses
  whichever is installed.
- **HTTPS with Caddy:** Caddy serves two sites with its internal CA (`tls internal`) on a high port, so a rootless runtime can bind it:
  `https://app.localhost:18443`, a static file server for the web build, and `https://sync.localhost:18443`, a reverse proxy to
  `harper-pad-sync`. Because the page and the API are on different https origins, as in production, CORS, the CSP `connect-src`
  and the client's "https only" rule are all exercised. `PUBLIC_URL` is `https://sync.localhost:18443` (the port is `E2E_PORT`), so the service's guard stays
  strict and there is no development exception. Playwright runs with `ignoreHTTPSErrors`, so the browser does not need Caddy's root
  certificate. (Chromium resolves `*.localhost` to loopback by itself; confirm this, and that Caddy issues for these names, when
  the stack is built.)
- **The devices:** the web build, built for the root path and mounted into Caddy, and two Chromium contexts, each with its own
  IndexedDB, acting as device A and device B. There is no frontend container and no `vite preview`.
- **Invites:** the test inserts an invite row into PostgreSQL itself, with the same SHA-256 token hash the service uses, bound to the default client account (`client_id`). It does not
  go through the admin UI, which sits behind a Cloudflare Access login, and the admin app has no authentication of its own to skip.
  The admin UI gets its own small test later, a plain HTTP one.
- **Checks, in this order:**
  1. **Enrollment:** device A pastes an invite URL and gets a token; using the same invite again fails.
  2. **Save pushes:** a draft made on A is in PostgreSQL shortly after the save.
  3. **Sync all and opening a note:** device B, enrolled with its own invite (which runs Sync all), has the draft. An edit on A
     reaches B when B opens the note, as a plain update with no "Conflicted copy". A draft created on A after B enrolled appears on
     B after Sync all.
  4. **Lose the server:** wipe the database, restart the sync service, re-enroll both devices, and check that Sync all rebuilds the
     drafts with no conflicted copies.
  5. **Later:** an offline edit on both devices makes a local conflicted copy, and a revoked token shows "Sign in again" while the
     local drafts stay; with a second client account, neither account sees the other's drafts or devices.
- **Settings it needs:** the page origin in the CORS allowlist and the sync origin in the web build's CSP `connect-src`, so this
  test is where the build-time setting for the sync origin is first exercised.
- **Where it runs:** CI follows the pattern of `scripts/screenshots.sh` and its workflow (a pinned `playwright-core` driving
  the runner's Chrome); locally it is a `make` target.
- **What it does not prove:** mTLS to PostgreSQL (the compose database uses password or trust authentication; the production
  certificate setup is checked on a real cluster, see the open questions), the real ingress and its certificate, cert-manager,
  Cloudflare and Access, and Safari or WebKit behaviour.

## Build order

Each step is its own pull request, from a branch off `origin/main`, and each leaves the app working with sync off.

1. **Local groundwork.** Tombstones, dirty tracking, the apply-remote store method, both migrations, with tests for the Go store and
   the web store.
2. **The server.** Enrollment, sync, devices, the admin container, the database roles and certificate setup, tests (including conflicts, deletes and the limits).
3. **The sync module** (`lib/sync.js`), with the pure logic (what to push, how to apply, how to resolve a conflict) unit-tested
   with Node's runner against fixtures, and the [end-to-end test](#end-to-end-test) against the real server.
4. **UI:** the enrollment and status screens, the device list and the status bar state.
5. **Docs and policy:** the changes below, and the CSP change.
6. **Hardening (v1.1):** the device-bound signing key, after the iPhone check in `TODO.md` passes. The device
   list is in steps 2 and 4, not here.
7. **v2:** end-to-end encryption ([v2](#v2-end-to-end-encryption)), after v1 is in use. It is independent of step 6.

## Documentation changes

- [security](security.md): replace "no accounts, no server and no network use beyond the update check" with the opt-in
  description, add this page's threat table, and the `connect-src` change.
- [storage](storage.md): schema version 3, the new columns and the tombstone record.
- [architecture](architecture.md) and `AGENTS.md`: the sync module, the new binary and its layout.
- [pages](pages.md): the web build's sync origin setting and CORS.
- A server operations page (run, proxy, back up, rotate, revoke).

## Open questions

- **The desktop webview origin** for the CORS allowlist, and whether the embedded page's CSP can name the sync origin at build
  time or needs a setting at run time.
- **Which OIDC provider** signs the operator in, and whether to also allow only specific devices or networks in the Access policy.
- **Approval of new devices:** whether enrollment should additionally need a confirmation on an already-enrolled device, so that
  admin access alone cannot add a device that reads the notes.
- **The exact CloudNativePG settings** for certificate authentication of application roles: the `pg_hba` entries and their order, and
  whether the certificate's common name must equal the role name (otherwise a `pg_ident` map). Check against the operator version
  in use and test before relying on it.
- **Retention of tombstones on the server:** forever (simple) or pruned after every enrolled device has passed them (smaller). Start
  with forever; one user does not delete enough to matter.
- **Whether a non-extractable key works in the installed iPhone app,** and how often iOS clears it. Test plan in `TODO.md`.
- **How large the first upload can be** before it needs chunking, given the 5 MB per draft limit.

## v2: end-to-end encryption

Status: proposal, after v1 and the v1.1 device key. Goal: **the server stores only ciphertext**, so a compromised server, a stolen
copy of its database or a copied device token reveals no draft text. This does not need a new kind of server: it still stores
and returns opaque `data` strings by id and version.

### What the server sees afterwards

| Visible to the server | Not visible |
|---|---|
| Doc ids, versions, created and updated times, the deleted flag, the size of each blob, request times and the client's IP | Draft text and format |

The ids and times stay in the clear because listing and conflict handling need them. Sizes leak roughly how long a draft
is. There is **no feature loss from hiding the text**: search already runs on each device's local copy, never on the server.

### Keys

- **Data key (DK):** 256 random bits made once, on the first device that turns encryption on. It is never sent to the server in the
  clear.
- **Per-doc key:** `HKDF-SHA-256(DK, info = "harper-pad doc " + id)`. This keeps the number of encryptions under any one AES key
  small, so a random 96-bit nonce is safe, and a blob cannot be moved to another id and still decrypt.
- **Cipher:** AES-256-GCM through WebCrypto, native in every browser including iOS Safari and in the desktop webview, so the sync
  module needs no crypto library for the data itself. (XChaCha20-Poly1305 is not in WebCrypto.)
- **Key bag on the server** (one per client account): the DK **wrapped** (AES-GCM) by a key-encryption key, plus the KDF parameters, so devices can fetch it.
  It holds one wrapping per unlock method, and the first version has two:
  1. **Passphrase.** The key-encryption key is `Argon2id(passphrase, salt)` with parameters stored in the key bag (a starting point:
     64 MiB, 3 passes, 1 lane), so they can be raised later. Argon2id is not in WebCrypto; use a pinned, audited WebAssembly
     implementation (the CSP already allows `'wasm-unsafe-eval'`) run in a worker, **for both builds** so the derivation is
     identical everywhere.
  2. **Recovery key.** A generated 160-bit secret shown once as groups of Base32 characters, to be saved in a password manager or
     printed. It wraps the same DK, so a forgotten passphrase is recoverable, and because it is high entropy it cannot be guessed
     offline.
- **A local copy of the key bag** on every device that has unlocked it. It is only ciphertext (the data key wrapped by the
  passphrase and recovery key), so keeping it is safe. It is what lets a device re-create the server's key bag on a new server without
  ever exposing the data key, which the web build holds as a non-extractable handle and cannot re-wrap. A device re-uploads it
  before any doc ([principles](#the-client-is-the-source-of-truth), rule 6).
- **Check value:** the key bag also holds a small known string encrypted under the DK, so a wrong passphrase is rejected on the
  device, before anything is decrypted.
- **Passphrase change:** unwrap the DK, wrap it again under the new key-encryption key, and upload the key bag with a
  compare-and-set on its version. No document is re-encrypted.

The server can serve the key bag to any device that holds a valid token, so a thief with a copied token can try passphrases
**offline** against it. That is why the recovery key exists, why the parameters are strong, and why the setup screen enforces a long
passphrase (a strength meter, and a length floor of about 12 characters, or four or more random words) or offers to generate one.

### Envelope

Each doc's `data` becomes this JSON string; the server checks only that it has this shape and is within the size limit:

```json
{"v": 2, "kid": "k1", "n": "<base64 12-byte nonce>", "c": "<base64 ciphertext + 16-byte tag>"}
```

The plaintext is the v1 blob plus a revision counter: `{"v":1,"format":"markdown","content":"...","rev":12}`. The additional
authenticated data is `id || "|" || v || "|" || kid`, so a blob cannot be swapped between docs or relabelled. `kid` names the data
key, which lets a later rotation tell old blobs from new ones.

### What this does and does not stop

- **A server cannot alter a blob** without the device noticing (GCM fails). It **can** refuse to return one, hide a delete, or
  **serve an old valid version** of a doc (a rollback). Each device remembers the highest `rev` it has seen for each doc and rejects a
  lower one. A device that has never seen the doc cannot detect a rollback; say so in the docs.
- **A thief with a copied token** gets ciphertext only, and can offline-guess the passphrase (above).
- **A thief with the unlocked device** has the DK in use there. After revoking the device, run **Rotate key** (below), or the thief
  can still decrypt anything they already downloaded and anything uploaded under the old key.
- **Losing both the passphrase and the recovery key loses the data.** The server cannot help, and the setup screen says so before
  it finishes.

### Where the data key lives on a device

| Build | Storage |
|---|---|
| Web (iPhone Home Screen app, browsers) | After unlocking, the DK is imported as a **non-extractable** WebCrypto key (HKDF material) and only that handle is stored in IndexedDB, so the passphrase is entered once per device. Same assumption as the v1.1 device key, and the same iPhone check in `TODO.md` covers it. |
| Desktop | The OS keyring where there is one; otherwise a file readable only by the user, or ask for the passphrase at each start (a setting). |

### Turning it on (migration from v1)

1. The user picks **Turn on encryption** on a device (this is the one place that needs a device already enrolled and synced).
2. The app makes the DK, shows the recovery key, asks for a passphrase and uploads the key bag. From now on the server **rejects any
   `data` that is not an envelope** (`encrypted` flag on the server, set by the first key bag), and any request from a client that
   does not send `Harper-Protocol: 2` gets an error telling it to update. Without this, an old client would quietly keep
   uploading plaintext.
3. The device re-encrypts and pushes every local doc as a new version. Other devices see the key bag, prompt for the
   passphrase, unlock and carry on.
4. **Plaintext remains in any copy of the database** made before this step, and the operator has to destroy those. The server
   keeps no other old copies, because there is no history. The settings screen says this.

New devices after step 3 enroll as in v1, then are asked for the passphrase or recovery key before the first sync.

### Rotating the key

**Rotate key** makes a new DK (`kid` increments), re-encrypts every doc under it, uploads the new key bag, and the
old `kid` is no longer accepted by the server for new writes. Other devices unlock again with the passphrase. Use it after revoking
a device that held the DK, or after a passphrase or recovery key may have leaked. It re-uploads everything, so it is slow on a
phone with many drafts, and it runs in chunks that can be resumed.

### Changes beyond v1

- **Server:** key bag endpoints (`GET` and `PUT /keys`, with compare-and-set), envelope shape validation, the `encrypted` flag and the
  protocol version check. Storage is unchanged; it holds ciphertext.
- **Client:** a `lib/crypto.js` (HKDF, AES-GCM, the envelope, the key bag) with test vectors checked in as shared fixtures like the
  existing Go and frontend tests, plus the Argon2id worker and the unlock, setup, change-passphrase and rotate screens.
- **Docs:** [security](security.md) (the new table above), and the operations page (destroying old plaintext copies).

### Open questions for v2

- **Argon2id memory on an iPhone.** 64 MiB inside a Home Screen app may be killed under memory pressure; measure it and pick the
  parameters from the result (add to the iPhone check in `TODO.md`).
- **Which Argon2id WebAssembly package** to pin, and whether to keep it lazy-loaded so v1 users do not pay for it.
- **Device pairing** as a third unlock method: an enrolled device wraps the DK to the new device's public key (ECDH P-256, in
  WebCrypto) through the server, after the user confirms a fingerprint on both. It avoids typing the passphrase on a phone but
  needs both devices online; leave it for after the first v2 release.
- **Whether to encrypt the id and times.** Not planned; it would break listing and conflict handling.

## Later

- **Server-side version history,** if wanted: keep the previous versions of each doc and a way to bring one back. v1 has none, because
  bringing one back has to read and write notes, and putting that in the admin UI would give the internet-reachable admin role access to
  them. It would be a command on the server host with the sync role. Until then the server keeps no older copies.
- **Syncing settings,** if wanted: the dictionary (a set union) and the ignore list (the newer replaces the older) are the candidates.
  They need their own table, validation and merge rules, which is why v1 leaves them out.
- **More client accounts.** The schema already carries `client_id`; what is missing is an admin action to create an account, an
  account selector in **New enrollment URL**, per-account operators (which would need the app to learn who is signed in, something v1 deliberately does not do), quotas, and the
  isolation checks above.
- **Sharing between client accounts,** with OIDC and short-lived tokens with refresh. This is a different feature from more accounts.
- **Merging text** with a CRDT such as Yjs (it has a CodeMirror 6 binding) if two-device simultaneous edits become common.
