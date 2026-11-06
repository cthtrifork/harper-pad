# Sync

Sync keeps your drafts, your personal dictionary and your ignore list the same on the desktop app and the web app (the iPhone Home Screen app is the web build). Each device holds all
its drafts and works without the server. The server is plain storage with compare-and-set: it never merges and never makes copies.
Sync is off until you enroll a device; without it the app uses the network only to check for an app update.

When your draft differs from another version of it, the app asks one question, in one dialog: **Keep or Overwrite**.

The server is described next to its code: [backend README](../backend/README.md), [sync API](../backend/cmd/harper-pad-sync/README.md),
[admin UI](../backend/cmd/harper-pad-admin/README.md), routes in [openapi.yaml](openapi.yaml). Files and the file link: [storage](storage.md).

## Rules

- The device is the source of truth. The server is a replica: if it is lost, the devices Create its drafts again.
- A draft the server lacks is Created there. Only an explicit delete Deletes a draft.
- Sync never changes the open draft while you type, and never decides a conflict.
- Revoking a device, an invalid token, a server reset and "Sign out" leave the drafts on the device.
- The device key is made on the device and never leaves it.

## What needs you

| Situation | What appears | Your choices |
|---|---|---|
| Your draft is edited and its file changed | The Keep or Overwrite dialog | Keep, Overwrite |
| Your draft is edited and the server holds different text | The same dialog | Keep, Overwrite |
| Your draft is unedited, and the file and the server disagree | The same dialog; the changed file counts as your edit | Keep, Overwrite |
| The open draft was deleted on another device | A dialog | Keep Creates the server draft again; Remove Deletes the draft here (the toast offers Undo) |
| The linked file is gone, unreadable or not text | The file name in the header is struck through, with the reason | Ctrl+S retries; Unlink. A file that is not text is never updated |
| The token was revoked | The chip says "Sign in again" | Paste a fresh invite |
| Enrolling | The Sync chip | Paste the invite URL |

## The Keep or Overwrite dialog

- It has no close button; Escape and a click outside do nothing. The editor is blocked; autosave keeps updating the draft behind it.
- It appears only for the open draft. A draft in conflict that is not open is left untouched (not Created, Updated or counted) until it is opened.
- One dialog covers the file and the server when both differ.
- Closing the window while it is open is allowed. The dialog returns the next time the draft is opened.
- Your draft keeps its id and its file link.
- **Overwrite** Updates the file, then the server, with your draft. The other versions are Deleted, with no undo. Its button is the danger style and its text says whose text is Deleted.
- **Keep** first Creates a Conflicted copy of each other version that differs from your draft (one copy when the file and the server hold the same text), then does what Overwrite does.
- A Conflicted copy is an ordinary draft without a file link, with a badge in memory ("Conflicted copy, from the file" or "from the server"). The badge goes when the copy is edited or deleted, from its x, or at restart. It is never kept on disk or synced, and the text is not edited.
- The file and the server are read again when you choose. If either changed, the dialog is redrawn and nothing is changed.
- A failed file update is skipped and the header chip says why; the server is still Updated.
- With the server unreachable the file is Updated and the server stays pending. The dialog returns for the server only if it changed again.
- The dialog looks the same on a phone: centered, Keep and Overwrite side by side.

## Other paths on this device

| Path | What happens |
|---|---|
| Edit your draft | Autosave Updates the draft, never the file. Ctrl+S Updates the file when the draft changed since the file was Updated |
| The file changed and your draft has no edits | The server is asked first. If it is unchanged, the draft and the server are Updated from the file at once, with an Undo toast. If it holds the same text as the file, nothing more. If it holds other text, the dialog. If it is unreachable or sync is off, the draft is Updated from the file, and the server once it is reachable |
| Undo of that update, then Ctrl+S | Your draft wins while the file is still the version the update read; otherwise the dialog |
| The draft is Updated from the file | The cursor and scroll position stay as far as the text allows, and autocorrect leaves the text alone |
| The server holds a changed draft | It Updates your draft. The file counts as older than the draft; the next Ctrl+S Updates it, after the dialog if the file also changed |
| Every file update | The file is read again first and its modified time, size and text hash compared; a difference opens the dialog |
| A file update fails, or the file is unreadable | The draft is kept; the chip shows the reason; Ctrl+S tries again; a gone file is Created again ("Recreated <name>") |
| Delete a linked draft | The file is untouched. Undo Creates the draft again without the link |
| Save as file onto the path of another draft | The link moves to this draft and the other draft is unlinked, with a toast naming it |
| Web build | It never links a draft to a file |
| Second launch of the app | It focuses the open window (desktop) |

## Sync moments

There is no timer. Every moment uses the same rules.

| Moment | What it does |
|---|---|
| Edit | Updates the server draft about 2 s after typing stops; Ctrl+S at once |
| Open a draft | Asks the server once; a changed server draft Updates yours unless you typed ("Updated from the server") |
| Delete | Deletes the server draft when the undo offer ends |
| Sync all | Runs at start-up and after enrolling, from the chip's pop-up too; ends with a summary like "3 created, 2 updated, 1 deleted" |
| Dictionary and ignore list | Updates the server about 2 s after a change, and on Sync all |

A draft that changed on both sides with different text is the dialog's; Sync all leaves it untouched. A run reads its decisions from
kept state, so an interrupted run is a partial one. "Changed" means the text hash differs from the hash at the last sync, so typing
and undoing changes nothing.

## The file link meets sync

- Only `{v, format, content}` travels. The path and the modified time stay on the device, and a draft Created from the server has no link.
- Remove in the deleted-elsewhere dialog never touches the file. Keep Creates the server draft again with its link.

## Dictionary and ignore list

These are small and are meant to be the same on every device, so there is no per-word merge: the last device to sync wins, and absence is
deletion. A device that syncs them for the first time Deletes nothing: it Creates the union of both sides.

- The server holds one row per account: a version and two JSON lists, `words` and `ignored` (Harper's 64-bit hashes as text). `GET` and
  `PUT /settings` ([openapi.yaml](openapi.yaml)) Update both whole, with compare-and-set. The server checks that both are lists of strings and
  never merges or looks inside.
- Both lists together are at most 256 KiB of JSON; a larger one gets a 413.
- A device sends its lists trimmed, without repeats or empty entries, and leaves out any entry another device would refuse (a phrase, a
  control character, a word over 64 characters, a hash that is not digits). The entry stays in the local dictionary.
- A device keeps one record: the server version it last matched and the lists it held then. It Updates the server when its lists differ from that
  record, and a 409 is read and tried again, three times. When only the server's version moved, the server's lists Update the device's.
- It runs on Sync all and about 2 s after a change, and waits for Harper at start-up.
- Lists from the server with any entry that is not a word or a hash are refused whole.
- The labels of ignored findings are not synced; a hash from another device shows as "A finding in its context".

## Failure states

| Failure | What happens |
|---|---|
| Server unreachable, or a 5xx | Edits stay on the device, the chip says pending, the next moment tries again |
| 401 | Syncing stops, drafts stay, the chip says "Sign in again". This also covers iOS clearing a Home Screen app's storage |
| The server rejects a draft (too large, bad request) | The draft stays and keeps updating locally; the chip says "Could not sync <title>: <reason>"; no dialog; the next moment tries again |
| Server lost | The devices Create the server drafts again; devices and tokens need enrolling again; a draft deleted on one device while another was offline can reappear |
| Dictionary or ignore list fails | The chip's pop-up says "Could not sync the dictionary and ignore list"; the next Sync all or change tries again; the local lists are untouched |
| Sync off | The network is used only to check for an app update |

## Limits

- Two devices that change the dictionary or ignore list between syncs: the one that syncs last wins, and the other's change is lost.
- A word removed on the other devices before a device enrolls comes back when that device still holds it: the first sync cannot tell "removed elsewhere" from "never had".
- Overwrite is the only choice that Deletes text, and the server keeps no history.

## Enrollment

Every device, including the first, enrolls the same way.

1. In the admin UI the operator names the device and picks **Add device**. It shows `https://sync.example.com/join#<token>` once. The
   token is 256 random bits, single-use, valid about 15 minutes and kept only as a hash. It is in the fragment, so it is not sent or logged.
2. In the app, open the **Sync chip**, paste the URL and choose **Add this device**. (Paste rather than open the link: on iPhone a
   tapped link opens Safari, which has separate storage from the Home Screen app.)
3. The app makes a signing key pair on the device and calls `POST /enroll` with the invite and a DPoP proof. It gets a device token bound to that key.
4. The app runs Sync all.

The invite is the approval: the operator signs in through Cloudflare Access with MFA, and every device is listed and revocable in the admin UI.

## Authentication

Every request after enrollment carries `Authorization: DPoP <device token>` and a `DPoP` proof header.

- The token is 256 random bits per device, long-lived, with no refresh token. The server keeps its SHA-256; deleting the device row makes the next request a 401.
- It is a header, not a cookie, so other sites cannot make the browser send it.
- Every credential failure (bad or replayed proof, unknown or revoked token, wrong key, bad invite) is the same generic 401.

**DPoP** is [RFC 9449](https://rfc-editor.org/rfc/rfc9449) with one change: the token is opaque, so the key's RFC 7638 thumbprint is kept on
the `devices` row instead of a `cnf.jkt` claim. The key is ECDSA P-256 and proofs are ES256 JWTs bound to the request and the token. The
server checks the proof before reading the body, using [go-dpop](https://github.com/AxisCommunications/go-dpop). A 60 second `iat`
window and a replay cache of proof ids replace a `DPoP-Nonce`.

| Attacker | What helps |
|---|---|
| Copies the token (log, proxy, script) but not the key | DPoP: the token is useless without a fresh proof from the key |
| Copies the device's own storage (disk image, backup, profile) | Not DPoP: on Chromium the kept key is usable. Revoke the device and encrypt the disk |
| Uses the unlocked device or runs script in the page | Revoke, and the strict CSP ([security](security.md)). Its edits reach the other devices; the server keeps no history |

## Key storage

The web and desktop builds keep a non-extractable WebCrypto key (only the private `CryptoKey`) and the token in the webview's IndexedDB. If that storage is
cleared the key is lost and the device enrolls again. `extractable: false` stops script exporting the key; it does not encrypt it on disk
(Chromium keeps it in plain form in the profile). Checked on an iPhone (Safari tab and Home Screen app, PR #86): key generation,
private-key-only storage, refused `exportKey` and raw signatures work, and the key survived 20.6 hours. Edge on Windows passes too. WebKitGTK was not checked.

Device settings (server URL, token, key) are one record, never sent to the server. Sync state lives in its own table or store, never on
the draft rows, and is never sent; an older build ignores it. The SQLite table is additive; the IndexedDB store needs a version bump ([pages](pages.md#changing-the-schema)).

## Security

| Concern | Handling |
|---|---|
| Transport | HTTPS only (cert-manager, HSTS at the ingress). The client refuses an `http:` server |
| Who can read the data | The server and its operator; Cloudflare is not in the sync path. Use encrypted volumes and keep bodies out of logs |
| Stolen token | Revoke the device |
| Invite theft | One use, 15 minutes, hashed, in the fragment |
| Account isolation | The account comes from the device row and every query filters on it. With one account this is a guard; narrow the row-security policy to the account before adding a second |
| Database and cluster | Client certificates only, PostgreSQL reachable only from the sync and admin pods, separate roles ([backend README](../backend/README.md)), default-deny NetworkPolicies, images pinned by digest |
| Admin UI | No Service and no listener outside its pod; reached through a Cloudflare Tunnel behind Cloudflare Access (OIDC, MFA); same-origin checks, CSRF tokens, strict CSP ([admin README](../backend/cmd/harper-pad-admin/README.md#access)) |
| Draft text from the server | Untrusted like pasted text: never run, never inserted as HTML, validated first |

Not defended: a compromised device, a compromised server, and traffic analysis.

## Not built

- A device list in the app: the admin page revokes devices behind a stronger login.
- Undo for what Sync all Deletes from drafts that are not open.
- A pending count or progress line on the chip.
- A server operations page: operating and backing up the server belongs to the cluster's GitOps repository.
- Scheduled token rotation with reuse detection: it is the fallback if iOS clears the key.
- End-to-end encryption, more than one client account, merging text, syncing other preferences (text size), and an OS keyring or TPM.

## Option: end-to-end encryption

Not planned. The server would hold only ciphertext, still as opaque `data` strings by id and version. Ids, versions, times, the deleted flag
and sizes stay visible.

- **Keys:** a random 256-bit data key from the first device; a per-draft key `HKDF-SHA-256(key, "harper-pad doc " + id)`; AES-256-GCM with
  additional data `id|version|key id`, so a blob cannot move to another draft.
- **Key bag** (`GET` and `PUT /keys`, compare-and-set): the data key wrapped by an Argon2id passphrase key (at least 32 MiB, 3 passes, 1 lane, in a worker) and by a generated 160-bit recovery key.
- **Limits:** a copied token gets ciphertext but can guess the passphrase offline; revoking a stolen device needs a key rotation; losing the passphrase and the recovery key loses the drafts.
- **Measured:** Argon2id (hash-wasm 4.12.0) took about 101, 107 and 218 ms at 32, 64 and 128 MiB on an iPhone Home Screen app.
- **Open:** which Argon2id WebAssembly package to pin, and device pairing as a third unlock method.
