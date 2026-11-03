# Sync (design)

Status: **proposal, not built.** This page describes an optional sync service so drafts, the personal dictionary and the ignore
list follow the user between the desktop app and the iPhone Home Screen app. Nothing here is in the code yet. When it is
built, this page becomes the reference and [storage](storage.md), [security](security.md) and [architecture](architecture.md)
get the matching changes (see [Documentation changes](#documentation-changes)).

## Goals and non-goals

Goals:

- The same drafts and dictionary on the desktop app and the web app (the iPhone Home Screen app is the web build).
- Works offline: editing never waits for the network, and changes made offline are sent when the app next syncs.
- Off by default. A user who never turns it on has no network use beyond today's update check, and the security page's
  "no server" statement stays true for them.
- Small to run: one Go binary with one SQLite file, on the user's own domain.

Non-goals for v1:

- **End-to-end encryption.** The server can read drafts. The wire format keeps the draft as an opaque string so it can be added later
  without a protocol change ([Later](#later)).
- **More than one user.** One server holds one user's data. There are no accounts, only devices.
- **Real-time collaboration or merging text.** Conflicts keep both versions; they are not merged.
- **Syncing files.** A draft's link to a file on disk stays on the device.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Server | A new Go binary, `harper-pad-sync`, with SQLite (`modernc.org/sqlite`, as the app uses) | One file to run and back up; reuses the app's driver and validation habits |
| Hosting | The user's own domain over HTTPS, behind a reverse proxy that terminates TLS | iOS needs a trusted certificate for service workers and `fetch` from the web app |
| Web build | Stays on GitHub Pages (`harper.portableinfo.cloud`) | Already deployed; sync is a different origin, so CORS and the CSP change |
| Users | One | No account table or sharing rules |
| Client | One JavaScript sync module used by both builds, on top of `backend.js` | The web build has no Go side; one implementation means one set of bugs |
| Auth | One opaque, long-lived bearer token per device, no refresh tokens | See [Authentication](#authentication) |
| Stolen-token hardening | v1: version history, a device list with last-seen and a 30-day idle expiry, "sign out other devices". v1.1: a device-bound signing key | See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device) |
| Encryption of content | None in v1 (TLS only) | Keeps the first version small; see [Later](#later) |
| Conflicts | Server-assigned versions; the loser becomes a "conflicted copy" draft | Never loses text, no merge logic |

## Overview

```
 desktop app (Wails)  ─┐                              ┌─ docs, settings, devices, invites
                       ├── HTTPS, Bearer token ──►  harper-pad-sync  ── SQLite file
 web app (Pages, iPhone)┘                              └─ CLI: invite, devices, revoke
```

Each device keeps its own full copy (SQLite on desktop, IndexedDB in the browser) and works without the server. The sync module
pushes local changes and pulls remote ones. The server is the only place versions are assigned, so devices never compare clocks.

## Enrollment

Every device, including the first, enrolls the same way.

1. On the server, the operator runs `harper-pad-sync invite`. It prints `https://sync.example.com/join#<token>`. The token is 256
   random bits, valid for about 15 minutes and for one use, and is stored only as a hash. It is in the URL **fragment** so it is not
   sent in the request line and not written to access logs.
2. On the device: Settings, Sync, **Add this device**, then paste the URL. The URL carries the server address and the token, so
   there is no separate server field.
3. The app generates nothing secret itself. It calls `POST /enroll` with the invite token and a device name and gets back a device
   token. The invite is now spent.
4. The app stores the device token and runs the first sync ([First sync](#first-sync)).

Why paste instead of opening the link: on iPhone, a tapped link opens Safari, which has separate storage from the installed Home
Screen app, so the enrollment would land in the wrong place. Pasting inside the installed app avoids it. The URL is only a
convenient way to carry the address and token in one string; opening it in a browser shows a short "copy this into Harper Pad" page.

States to design: sync off, paste the URL, error (invite expired or used, server unreachable, not HTTPS), first-sync choice and
progress, and the device list with rename and revoke. Follow the [design cheat sheet](design-cheatsheet.html), keep transitions
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
- A token unused for 30 days is treated as expired, so forgotten devices clean themselves up.
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
| **Copies the token** (a backup, a disk image, a dump of IndexedDB) but does not keep the device | The bearer token | A device-bound key (v1.1); revocation; idle expiry |
| **Uses the unlocked device** (or script running in the page) | The token, the key, and the drafts themselves | Revocation, version history, and the strict CSP; nothing else can stop a legitimate client being used |

**v1 (cheap, covers both):**

- **Version history on the server** ([History](#history)), so overwritten or deleted drafts can be restored.
- **A device list** with name, created, last-seen, and the user agent; **Sign out other devices**; revoke from the CLI.
- **A notice** (a banner on the next open of each device) when a device enrolls or is revoked.
- **30-day idle expiry**, above.

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
  again", the same recovery as an expired token. Call `navigator.storage.persist()` (`keepData()`) as the app already does.
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
| Dictionary | the word list | |
| Ignore list | Harper's export string | |

Draft ids are already 16 bytes (6 of time, 10 random) as 32 hex characters (`internal/store/drafts.go`, `newID`), so devices
can create drafts offline without colliding.

### Server schema (sketch)

```sql
docs     (id TEXT PRIMARY KEY, version INTEGER NOT NULL, created_at INTEGER, updated_at INTEGER,
          deleted INTEGER NOT NULL DEFAULT 0, data TEXT)           -- data: opaque string, the draft blob
settings (key TEXT PRIMARY KEY, version INTEGER NOT NULL, value TEXT)
history  (id TEXT, version INTEGER, updated_at INTEGER, deleted INTEGER, data TEXT, PRIMARY KEY (id, version))
devices  (id TEXT PRIMARY KEY, name TEXT, user_agent TEXT, token_hash BLOB UNIQUE, created_at INTEGER, last_seen INTEGER,
          public_key TEXT)                                         -- public_key (JWK) is empty until the v1.1 device-bound key
invites  (token_hash BLOB PRIMARY KEY, expires_at INTEGER, used INTEGER NOT NULL DEFAULT 0)
meta     (key TEXT PRIMARY KEY, value TEXT)                        -- schema version, and the change counter
```

`version` comes from one counter that increases on every accepted change anywhere. A client's cursor is the highest counter value
it has seen, so `since=<cursor>` returns everything newer, including deletions (`deleted = 1`).

### History

Every accepted change to a doc also writes the previous state to `history`, so an attacker's (or a bug's) overwrite or deletion can
be undone. Keep the last 20 versions of each doc or 90 days, whichever keeps more, and never prune the latest state or a
tombstone. The CLI restores one (`harper-pad-sync restore <id> [--version n]`); an in-app restore is a later addition. This is the
one measure that helps against every kind of compromise, including a live one, which is why it is in v1.

The server validates what the app validates: drafts at most 5 MB of valid UTF-8, a known format, a strict id; at most 10,000
dictionary words of at most 64 characters; an ignore list of valid JSON and at most 1 MB. All SQL uses `?` parameters.

## Protocol

JSON over HTTPS. Every route except `/enroll` needs the bearer token.

| Route | Purpose |
|---|---|
| `POST /enroll` | `{invite, deviceName}` returns `{deviceToken}`. Spends the invite. |
| `GET /sync?since=<cursor>&limit=<n>` | `{changes: [...], cursor, more}`: docs and settings changed after the cursor, deletions included. |
| `POST /sync` | `{changes: [{id, baseVersion, deleted, data, ...}]}` returns, per change, `ok` with the new version, or `conflict` with the server's current copy. |
| `GET /devices`, `PATCH /devices/<id>`, `DELETE /devices/<id>` | List, rename, revoke. |

A change is accepted only if `baseVersion` equals the server's current version for that id (0 for a new one). Otherwise the server
answers `conflict` and includes its copy. A deletion is a change with `deleted: true`.

### Conflicts

When a push comes back `conflict`, the client keeps the server's copy under the original id and saves its own text as a **new
draft** whose title line is prefixed with "Conflicted copy" and the device name, then pushes that as a new doc. Nothing is lost
and the user decides which to keep. Delete versus edit follows the same rule: an edit to a doc deleted elsewhere is restored
(this matches how "undo delete" works today); a deletion of a doc edited elsewhere is dropped and the edit survives.

Dictionary words merge as a set union; a word removed on one device and not on another comes back, which is the safe
direction for a dictionary. The ignore list is replaced as a whole by the newer version (it is Harper's own export, which the app
cannot merge).

### First sync

If a device has local drafts when it enrolls, the app offers **Merge** (the default: upload local drafts as new docs and pull remote
ones), **Replace local with the server's** and **Cancel**. Merge cannot overwrite anything, because ids are unique.

### When it runs

On start, when the page becomes visible or the window regains focus, about 2 seconds after a save (debounced), and on a timer while
the app is open. iOS has no background sync, so a change made offline waits for the next time the app opens. A sync never blocks
typing; the status bar shows only "Synced", "Syncing", "Offline" or "Sign in again".

## Changes to local storage

The groundwork, and the riskiest part, because it touches both storage engines. It changes nothing for a user who leaves sync off.

- **Tombstones.** `DeleteDraft` is a hard delete today (`DELETE FROM drafts`), so a deletion cannot be sent. Keep a small record of
  deleted ids that are pending upload, and remove it once the server has acknowledged it.
- **Per-draft sync state:** `dirty` (changed since the last successful push) and `server_version` (the version last
  seen). Both are local columns; neither is sent.
- **A way to apply remote changes without rewriting them.** `Store.Save` always sets `updated_at` to now and recomputes the
  summary, which is right for typing but wrong for applying a pulled draft, whose timestamps must be kept and which must not be
  marked dirty. Add a separate store method for it, with the same validation.
- **Migrations.** SQLite `PRAGMA user_version` 2 to 3, and `DB_VERSION` for IndexedDB, both upgrading an old database in place
  and refusing a newer one as they do now. Update the shared fixtures so the Go and the frontend tests keep checking the same
  cases.
- **Device-local sync settings** (server URL, device token, cursor, device name) live outside the synced `settings` table so they
  are never uploaded. On desktop that is a separate table or key set; in the browser a separate IndexedDB key.
- New host calls go through `backend.js` with both implementations, as [pages](pages.md) requires. New Go service methods mean
  running `make bindings`.

## Security

This is a bearer-token model with transport security and no content encryption.

| Concern | Handling |
|---|---|
| Transport | HTTPS only, on a certificate iOS trusts. The client refuses an `http:` server. |
| Who can read the data | The server and whoever controls it, since content is not encrypted in v1. Protect it with disk encryption, a locked-down host, backups that are protected like the live file, and no request bodies in logs. The settings screen says this plainly. |
| Stolen device token | Revoke that device from another device or the CLI; 30-day idle expiry; version history to undo damage; from v1.1 a device-bound key makes a copied token useless. The token grants only this one user's data. See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device). |
| Invite theft | One use, 15 minutes, hashed at rest, in the URL fragment. |
| Guessing | 256-bit tokens; rate limits and generic 401s on `/enroll` and on bad tokens. |
| Cross-origin use | CORS allows exactly the Pages origin and the desktop app's webview origin, not `*`, and only the headers and methods the API uses. Bearer headers, not cookies. |
| Abuse and size | Request and field limits as in the app, a per-server quota, and a limit on changes per request. |
| Content-Security-Policy | `connect-src` is `'self'` today. Add the sync origin only when sync is configured (a build-time setting for the web build; the desktop page is embedded, so it needs the origin in its policy too), and change nothing else. See [security](security.md). |
| Token at rest on the client | On the web it is in IndexedDB, readable by any script on the origin, which the strict CSP (no inline scripts, no `eval`) is there to prevent. On desktop it is in the local database, outside the synced settings. Neither is encrypted; there is no OS keyring in the web build. |
| Draft text from the server | Treated as untrusted data like any pasted text: never run, never put in the page as HTML, validated before it is stored. |

Not defended: a compromised device (it has the data), a compromised server (it has the data in v1), and traffic analysis (the
server sees sizes and times).

## Deploying the server

One binary, a data directory, and a reverse proxy (Caddy, nginx or similar) that terminates TLS for the domain and proxies to the
binary on a local port. The binary refuses to run an unauthenticated listener on a public interface without TLS in front (it
checks `X-Forwarded-Proto` or an explicit `--behind-proxy` flag). The SQLite file is the only state and is backed up like any
other file; it uses the same rollback journal setup as [storage](storage.md#practices-in-use), so a copy at rest is one file.

CLI: `harper-pad-sync serve`, `invite`, `devices`, `revoke <id>`.

## Build order

Each step is its own pull request, from a branch off `origin/main`, and each leaves the app working with sync off.

1. **Local groundwork.** Tombstones, dirty tracking, the apply-remote store method, both migrations, with tests for the Go store and
   the web store.
2. **The server.** Enrollment, sync, devices, the CLI, tests (including conflicts, deletes and the limits).
3. **The sync module** (`lib/sync.js`), with the pure logic (what to push, how to apply, how to resolve a conflict) unit-tested
   with Node's runner against fixtures, and an end-to-end test against the real server.
4. **UI:** the enrollment and status screens, the device list and the status bar state.
5. **Docs and policy:** the changes below, and the CSP change.
6. **Hardening (v1.1):** the device-bound signing key, after the iPhone check in `TODO.md` passes. Version history, the device
   list and idle expiry are in steps 2 and 4, not here.

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
- **Where the server code lives:** in this repository (shares the validation constants and the driver) or its own. In this
  repository is simpler for v1; the release workflow would then need a second artifact.
- **Retention of tombstones on the server:** forever (simple) or pruned after every enrolled device has passed them (smaller). Start
  with forever; one user does not delete enough to matter.
- **Whether a non-extractable key works in the installed iPhone app,** and how often iOS clears it. Test plan in `TODO.md`.
- **How large the first upload can be** before it needs chunking, given the 5 MB per draft limit.

## Later

- **End-to-end encryption.** Encrypt each doc's `data` on the device with an authenticated cipher, binding the id and version as
  associated data so the server cannot swap or roll back blobs unnoticed. The key comes from a passphrase (Argon2id, which in the browser
  needs a WebAssembly library) or from device-to-device pairing. Titles, and anything else the server sees, would have to be inside
  the encrypted blob, and server-side search would be lost.
- **Multiple users or sharing,** with OIDC and short-lived tokens with refresh.
- **Merging text** with a CRDT such as Yjs (it has a CodeMirror 6 binding) if two-device simultaneous edits become common.
