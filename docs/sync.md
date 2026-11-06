# Sync

Optional sync keeps **notes** (scratch pad drafts) the same on the desktop app and the web app (the iPhone Home Screen app is
the web build). It is built, on both the client and the server. The server is described next to its code: the
[backend README](../backend/README.md), the [sync API](../backend/cmd/harper-pad-sync/README.md) and the
[admin UI](../backend/cmd/harper-pad-admin/README.md). This page is the design and the rules the clients follow.

## How it works

- Each device holds a full copy of its notes and works without the server. Sync runs behind the editor and never blocks typing.
- The server is plain storage with compare-and-set. It assigns each draft a version, never merges, never makes copies and has no
  change feed. All sync logic is on the device.
- A device syncs at four moments: **save** (about 2 seconds after typing stops), **delete** (when the undo offer ends), **opening a
  note**, and **Sync all** (a button in the sync chip's pop-up; it also runs after enrolling and at start-up). There is no timer.
- Sync is off by default. Without it the app uses the network only for the update check.
- Operators run a Go sync service, a small Go + HTMX admin container and PostgreSQL on their own domain.

Not in v1: syncing settings (dictionary, ignore list, text size), end-to-end encryption, more than one client account, merging
text, syncing files, and any OS keyring or TPM (the desktop webview stores its key like the web build does).

## The device is the source of truth

The server is a relay and a replica; if it is lost, syncing from the devices rebuilds it. These rules win over anything else
on this page.

1. **Local first.** Reads and writes use the device's own store. The app behaves the same with sync off, the server down or the
   token revoked, and a failed sync never loses an edit.
2. **Absence is not deletion.** Only an explicit tombstone deletes a draft. A draft the server lacks is uploaded, never removed locally.
3. **Sync never changes the open draft under the user.** A pull never overwrites unsent edits. In a conflict the local text keeps
   its id and the other version becomes a "conflicted copy" ([Conflicts](#conflicts)).
4. **The server cannot destroy local data.** Revoking a device, an invalid token, a server reset and "Sign out" leave local drafts
   in place; sync just stops.
5. **An empty server just receives uploads.** To rebuild one, enroll the devices and run Sync all.
6. **The server never makes a secret a device must keep private.** The device's key is generated on the device and never sent.
   The server only creates invite and device tokens, and stores them as hashes.

If the whole server is lost, drafts are rebuilt from the devices; devices and tokens need re-enrolling ("Sign in again", local
data untouched); tombstones are lost, so a draft deleted on one device while another was offline can reappear (delete it again).

## Enrollment

Every device, including the first, enrolls the same way.

1. In the admin UI the operator names the device and picks **Add device**. It shows `https://sync.example.com/join#<token>` once.
   The token is 256 random bits, single-use, valid about 15 minutes and stored only as a hash. It is in the URL fragment so it is
   not sent in requests or logged.
2. In the app, open the **Sync chip**, paste the URL and choose **Add this device**. (Paste rather than open the link: on iPhone a
   tapped link opens Safari, which has separate storage from the Home Screen app.)
3. The app generates a signing key pair that never leaves the device and calls `POST /enroll` with the invite, a device name and a
   DPoP proof from the new key. It gets back a device token bound to that key.
4. The app runs the first sync, which is Sync all.

There is no approval step on another device: the invite is the approval. The operator signs in through Cloudflare Access with MFA,
every device is listed and revocable in the admin UI, and a confirmation step could lock the user out. The device list lives only in
the admin page, not in the app.

## Authentication

After enrollment every request carries `Authorization: DPoP <device token>` and a `DPoP` proof header.

- The token is 256 random bits, **per device**, long-lived and has no refresh token. The server stores its SHA-256, and deleting
  the device row makes the next request a 401. `last_seen` shows dormant devices to revoke by hand.
- A header, not a cookie, so other sites cannot make the browser send credentials.
- Every credential failure (bad proof, replayed proof, unknown or revoked token, wrong key, bad invite) is the same generic 401.
- On a 401 the client stops syncing and shows "Sign in again", which also covers iOS clearing a Home Screen app's storage.

### Limiting the damage of a stolen device

| Attacker | What helps |
|---|---|
| Copies the **token** (log, proxy, script) but not the key | **DPoP**: the token is useless without a fresh proof from the key |
| Copies the device's **own storage** (disk image, backup, profile) | Not DPoP: on Chromium engines the stored key is usable. Revoke the device and encrypt the disk |
| **Uses the unlocked device** or runs script in the page | Revoke, and the strict CSP ([security](security.md)). Its edits sync to other devices; there is no server-side undo |

**DPoP** is [RFC 9449](https://rfc-editor.org/rfc/rfc9449) with one change: the token is opaque, so the key binding (the key's
RFC 7638 thumbprint) is stored on the `devices` row instead of in a `cnf.jkt` claim. The device key is ECDSA P-256 and proofs are
ES256 JWTs bound to the request and the token. The server checks the proof **before reading the body**, with
[go-dpop](https://github.com/AxisCommunications/go-dpop) and a `ttlcache` for replays (`backend/internal/auth`). There is no
`DPoP-Nonce`; a 60 second `iat` window and the `jti` cache replace it.

**Key storage** is the same on the web and on desktop: a non-extractable WebCrypto key (only the private `CryptoKey` is stored) in
the webview's IndexedDB, in the `sync-device` record with the token ([Changes to local storage](#changes-to-local-storage)). If
storage is cleared the key is lost and the device re-enrolls.

Things to know:

- `extractable: false` stops script exporting the key; it does not encrypt it on disk. Tested on Chromium: the private key was in
  plain form in the profile's IndexedDB files and a signature made from that copy verified. WebKit was not tested for this.
- DPoP does not stop script in the page or someone using the unlocked device, as both can ask the key to sign.
- Checked on an iPhone (4 and 5 November 2026, Safari tab and Home Screen app, PR #86): key generation, private-key-only storage,
  refused `exportKey` and raw signatures work, and the key survived 20.6 hours. Edge 156 on Windows passes too. WebKitGTK was not checked.

Not planned: scheduled token rotation with reuse detection. It is the one measure that would notice a copied profile being used,
and the fallback if iOS turns out to clear the key.

## Protocol

The schema is `backend/internal/store/migrations/0001_init.sql`, the routes are in [openapi.yaml](openapi.yaml) and the
[backend README](../backend/README.md) covers the database roles; the code is the documentation. The server is plain storage, so
all sync logic is on the device ([Conflicts](#conflicts)).

### When sync happens

All four moments use the same decision table ([Conflicts](#conflicts)).

| Moment | What it does |
|---|---|
| **Save** | About 2 s after typing stops, `PUT` that one draft. The **Sync** button (Ctrl+S; "Save" when sync is off) pushes at once, then asks the server about the open draft, so a newer version or delete from another device is found: a newer version is swapped in if nothing was typed, otherwise the status line says "Newer on the server". Offline or on error the draft stays *changed* and goes with the next save or Sync all. |
| **Delete** | The tombstone is pushed when the undo offer ends, so an undone delete never reaches the server. An unsent tombstone is found by the next Sync all. |
| **Opening a note** | Local text shows at once. In the background the device fetches the draft with `If-None-Match`. A newer state is swapped in ("Updated from the server") only if the draft is unchanged here and the user has not typed; otherwise the note gets a "Newer on the server" marker. A 404 changes nothing. A tombstone for a draft changed here changes nothing (the edit survives). A tombstone for an unchanged draft is never applied silently: a modal asks **Keep** (upload it again) or **Remove** (remove it here; the toast offers Undo). Sync all asks the same question for the open draft. |
| **Sync all** | Lists the state of every draft on the server and reconciles both ways, ending with a summary like "3 uploaded, 2 downloaded, 1 conflicted copy, 1 removed" (removals can be undone). |

A run recomputes every decision from stored state, so an interrupted run (a suspended phone) is just a partial one. iOS has no
background sync, so nothing depends on one.

### Conflicts

For each draft the device compares its own text now, the state recorded at the last sync, and the server's current state. The same
table applies to a save that comes back 409, to opening a note and to Sync all. **In the code it is one place**: `createSyncer` in
`frontend/src/lib/syncRun.js` (the table is the pure `decide` in `syncPlan.js`; `all()` is Sync all, `one(id)` a save, `open(id)`
opening a note), and `syncOneEngine.test.js` fails if another module decides or uploads drafts.

| This device | The server | What happens |
|---|---|---|
| Unchanged | Unchanged | Nothing. |
| Unchanged | Newer state | Download and apply it. |
| Changed | Unchanged | Upload it. |
| Changed | Changed, same text and format | Adopt the server's state. |
| Changed | Changed, different text | **Conflict:** make a copy (below). |
| Changed | Deleted | The edit survives: upload it again. |
| Unchanged | Deleted | Remove it here, with undo. |
| Deleted here | Unchanged | Upload the tombstone. |
| Deleted here | Edited elsewhere | The edit survives: download it, drop the pending delete. |
| Has it | No copy, no tombstone | Upload it. |
| Does not have it | Has it, no pending delete | Download it. |

"Changed" means the text's hash differs from the one in the sync state, so typing and then undoing is unchanged. Nothing in the
table replaces changed text: a draft with unsent edits is only uploaded or kept next to the server's version as a copy.

**Editing a note deleted elsewhere** needs no server special case: a tombstone is a row with a `version` and `updated_at`, so the
device pushes its text with those as `base` and the row is live again. The deleting device gets it back as a plain update.

**The copy is made locally.** The server's different version is saved as a **new draft** whose first line is prefixed
"Conflicted copy" and the time; the device's own text keeps its id (rule 3) and is pushed on top. The copy is an ordinary draft
that syncs like any other, so nothing is lost and the user deletes whichever they do not want. The user is told by a line beside
the status chip, "Kept the server version as a copy", with an **Open copy** button, for about twelve seconds.

### First sync

Enrolling runs **Sync all** once: it uploads what the server lacks and downloads what the device lacks. There is no "replace local
with the server's" option, because the server must not be able to discard what a device holds (rule 4). To start clean, delete the
drafts on the device first.

## Changes to local storage

Sync state lives in its own table or store (`sync_state` in SQLite, `sync` in IndexedDB), never on the draft rows, and is never sent.
It changes nothing for a user who leaves sync off. The reasons behind the shape:

- **No dirty flag.** A draft is *changed* when its hash differs from the one recorded at the last sync, computed on demand so it
  cannot go stale. A delete is a state record with no draft (a *pending delete*), so undo is then no change at all.
- **Older builds keep working.** Both changes are additive: SQLite's `user_version` stays 2 and IndexedDB's `DB_VERSION` goes to 3
  ([pages](pages.md#changing-the-schema)). An older build ignores the state and cannot lose it, and sees what it saves or deletes as
  a change. A build from before `#83` fails on the newer IndexedDB version; there is no way around that.
- **Device settings** (server URL, token, key) are one `sync-device` record in the app's IndexedDB on web and desktop alike. They
  are never uploaded; a cleared profile means "Sign in again".

## Security

A device-token model with DPoP key binding, TLS and no content encryption.

| Concern | Handling |
|---|---|
| Transport | HTTPS only (Let's Encrypt via cert-manager, terminated at the ingress, HSTS). The client refuses an `http:` server. |
| Who can read the data | The server and its operator. Cloudflare is not in the sync path. Use encrypted volumes, tight namespace access, and keep bodies out of logs. The settings screen says this. |
| Stolen token | Revoke the device. See [Limiting the damage of a stolen device](#limiting-the-damage-of-a-stolen-device). |
| Invite theft | One use, 15 minutes, hashed at rest, in the URL fragment. |
| Account isolation | The account comes from the device row and every query filters on it. v1 has one account, so this is a guard for the future; before adding a second, narrow the `sync_rows` policy to the account and test isolation. |
| Database and cluster | Client certificates only, PostgreSQL reachable only from the sync and admin pods, separate roles ([backend README](../backend/README.md)). Default-deny NetworkPolicies, hardened pods, no Kubernetes API token, images pinned by digest. |
| Admin UI | No Service and no listener outside its pod, reached only through a Cloudflare Tunnel behind Cloudflare Access (OIDC, MFA). The app does no authentication of its own, so the Access policy is the only access control. It adds same-origin checks, CSRF tokens and a strict CSP. See the [admin README](../backend/cmd/harper-pad-admin/README.md#access). |
| Draft text from the server | Untrusted like pasted text: never run, never inserted as HTML, validated before it is stored. |

Not defended: a compromised device, a compromised server (the [encryption option](#option-end-to-end-encryption) would leave it
only ciphertext), and traffic analysis.

## Decided not to build

Decided on 5 November 2026; each can be reopened:

- **A device list in the app.** The admin page already lists and revokes devices behind a stronger login; a revoke from the app
  would be authenticated by a device token alone, so one stolen device could revoke the rest.
- **Undo for what Sync all removes from drafts that are not open.** Deletes already had Undo where they were made, and the open
  draft has Keep, Remove and Undo.
- **A pending count and a progress line on the chip.** Sync all takes a second or two.
- **A committed end-to-end test of the sync flows.** The CI `e2e` job checks the stack itself, and the unit tests drive the real
  web store against a fake of the server's routes.
- **A "Newer on the server" marker on the drafts drawer's cards.** Sync all updates every draft that is not open.
- **A server operations page.** Running and backing up the server belongs to the cluster's GitOps repository.

## Option: end-to-end encryption

Not planned. The server would store only ciphertext, still as opaque `data` strings by id and version, so it needs no new kind of
server. Ids, versions, times, the deleted flag and sizes stay visible.

- **Keys:** a random 256-bit data key (DK) made on the first device; per-doc key `HKDF-SHA-256(DK, "harper-pad doc " + id)`;
  AES-256-GCM with additional authenticated data `id|v|kid` so a blob cannot move to another doc.
- **Key bag** (a `keybag` table, `GET` and `PUT /keys` with compare-and-set): the DK wrapped by an Argon2id passphrase key (at
  least 32 MiB, 3 passes, 1 lane, in a worker) and by a generated 160-bit recovery key. Unlocked devices keep a local copy.
- **Envelope:** `{"v":2,"kid":"k1","n":"<nonce>","c":"<ciphertext+tag>"}`; the plaintext is the v1 blob plus a `rev` counter, and a
  device rejects a lower `rev` than it has seen.
- **Limits:** a copied token gets ciphertext but can guess the passphrase offline; revoking a device after theft needs **Rotate
  key**; losing both the passphrase and the recovery key loses the notes.
- **Measured:** Argon2id (hash-wasm 4.12.0) took about 101, 107 and 218 ms at 32, 64 and 128 MiB on an iPhone Home Screen app.
- **Open:** which Argon2id WebAssembly package to pin, and device pairing as a third unlock method.

## Later

- **Syncing settings:** the dictionary (set union) and the ignore list need their own table and merge rules.
