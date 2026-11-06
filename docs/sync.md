# Sync

Sync keeps your drafts, your personal dictionary and your ignore list the same on the desktop app and the web app (the iPhone Home Screen app is the web build). Each device holds all
its drafts and works without the server. The server is plain storage with compare-and-set: it never merges and never makes copies.
Sync is off until you enroll a device; without it the app uses the network only to check for an app update.

When your draft differs from another version of it, the app asks one question, in one dialog: **Keep or Overwrite**.

The server is described next to its code: [backend README](../backend/README.md), [sync API](../backend/cmd/harper-pad-sync/README.md),
[admin UI](../backend/cmd/harper-pad-admin/README.md), routes in [openapi.yaml](openapi.yaml).

## Rules

- The device is the source of truth. The server is a replica.
- A draft the server lacks is Created there. Only an explicit delete Deletes a draft.
- Sync never changes the open draft while you type, and never decides a conflict.
- Revoking a device, an invalid token, a server reset and turning off sync on this device leave the drafts on the device.
- The device key is made on the device and never leaves it.

## What needs you

| Situation | What appears | Your choices |
|---|---|---|
| Your draft is edited and its file changed | The Keep or Overwrite dialog | Keep, Overwrite |
| Your draft is edited and the server holds different text | The same dialog | Keep, Overwrite |
| Your draft is unedited, and the file and the server disagree | The same dialog; the changed file counts as your edit | Keep, Overwrite |
| The open draft was deleted on another device | A dialog | Keep Creates the server draft again; Remove Deletes the draft here (the toast offers Undo) |
| The linked file is gone, unreadable or not text | The file name in the header is struck through; its tooltip gives the reason | Ctrl+S retries; the x on the file name Deletes the link; Save as file beside it picks another path. A file that is not text is never updated |
| The token was revoked | The chip says "Sign in again" | Paste a fresh invite |
| Enrolling | The Sync chip | Paste the invite URL |

## The Keep or Overwrite dialog

- It has no close button; Escape and a click outside do nothing. The editor is blocked; autosave keeps updating the draft behind it.
- It appears only for the open draft. A draft in conflict that is not open is left untouched (not Created, Updated or counted) until it is opened.
- One dialog covers the file and the server when both differ.
- Closing the window while it is open is allowed. The dialog returns the next time the draft is opened.
- Your draft keeps its id and its file link.
- Under the first sentence, one row per version that exists (your draft, the file, the server) gives its number of lines and when it was edited or changed; a time that is unknown is left out, and a narrow screen shows the lines only.
- **Overwrite** Updates the file, then the server, with your draft. The other versions are Deleted, with no undo. Its button is the danger style and its text says whose text is Deleted. When your draft has no edits of its own, it takes the file's text and only the server is Updated.
- **Keep** first Creates a Conflicted copy of each other version that differs from your draft (one copy when the file and the server hold the same text), then does what Overwrite does.
- A Conflicted copy is an ordinary draft without a file link, with a badge in memory ("Conflicted copy, from the file", "from the server" or "from the file and the server"). The badge goes when the copy is edited or deleted, from its x, or at restart. It is never kept on disk or synced, and the text is not edited.
- The file and the server are read again when you choose. If either changed, the dialog is redrawn and nothing is changed.
- A failed file update is skipped and the header chip says why; the server is still Updated.
- With the server unreachable the file is Updated and the server stays pending. The dialog returns for the server only if it changed again.
- The dialog looks the same on a phone: centered, Overwrite on the left and Keep, which has the focus, on the right.

## Other paths on this device

| Path | What happens |
|---|---|
| Edit your draft | Autosave Updates the draft, never the file. Ctrl+S Updates the file when the draft changed since the file was Updated |
| The file changed, your draft has no edits and you are not typing | The server is asked first. If it is unchanged, the draft and the server are Updated from the file at once, with an Undo toast. If it holds the same text as the file, nothing more. If it holds other text, the dialog. If it is unreachable or sync is off, the draft is Updated from the file, and the server once it is reachable |
| Undo of that update, then Ctrl+S | Your draft wins while the file is still the version the update read; otherwise the dialog |
| The draft is Updated from the file | The cursor and scroll position stay as far as the text allows, and autocorrect leaves the text alone |
| The server holds a changed draft | It Updates your draft. The file counts as older than the draft; the next Ctrl+S Updates it, after the dialog if the file also changed |
| Every file update | The file is read again first; if something else changed it since your last update, the dialog opens instead (Overwrite skips this, but never Updates a file that is not text) |
| A file update fails, or the file is unreadable | The draft is kept and Ctrl+S tries again; a gone file is Created again ("Recreated <name>") |
| Delete a linked draft | The file is untouched. Undo Creates the draft again without the link |
| Save as file | Offered only for a draft without a link, and beside a struck file name. Ctrl+Shift+S on a linked, healthy draft only shows "Unlink first to save as another file" |
| A dot beside the file name | Your draft has changes the file does not have yet; Ctrl+S or Save Updates the file and the dot goes. Never shown with a struck file name |
| The x on the file name | Deletes the link only; the file and your draft are untouched. A toast "Unlinked <name>" has Undo, which Creates the same link again (path and baseline); then Save as file returns |
| Save as file onto the path of another draft | The link moves to this draft and the other draft is unlinked, with a toast naming it |
| Web build | It never links a draft to a file |
| Second launch of the app | It focuses the open window (desktop) |

## Sync moments

Sync is never periodic. Every moment uses the same rules.

| Moment | What it does |
|---|---|
| Edit | Updates the server draft about 2 s after typing stops; Ctrl+S at once |
| Open a draft | Asks the server once; a changed server draft Updates yours unless you typed ("Updated from the server") |
| Delete | Deletes the server draft when the undo offer ends |
| Sync all | Runs at start-up and after enrolling, from the chip's pop-up too; ends with a summary like "3 uploaded, 2 downloaded, 1 removed", which also counts failed and left-open drafts |
| Dictionary and ignore list | Updates the server about 2 s after a change, and on Sync all |

A draft that changed on both sides with different text is the dialog's; Sync all leaves it untouched. Typing and then undoing is no change.

## The file link meets sync

- Only `{v, format, content}` travels, with the draft's own times. The file path and the file's modified time stay on the device, and a draft Created from the server has no link.
- Remove in the deleted-elsewhere dialog never touches the file. Keep Creates the server draft again, and the draft keeps its file link.

## Dictionary and ignore list

These are small and are meant to be the same on every device, so there is no per-word merge: the last device to sync wins, and absence is
deletion. A device that syncs them for the first time Deletes nothing: it Creates the union of both sides.

- It runs on Sync all and about 2 s after a change. At start-up it waits for Harper.
- The labels of ignored findings are not synced; a hash from another device shows as "A finding in its context".
- If it fails, the chip's pop-up says "Could not sync the dictionary and ignore list" (see Failure states).

## Failure states

| Failure | What happens |
|---|---|
| Server unreachable | Edits stay on the device, the chip says "Offline", the next moment tries again |
| A 5xx | Edits stay on the device, the chip's pop-up says "Some drafts are not sent yet.", the next moment tries again |
| 401 | Syncing stops and the chip says "Sign in again". A lost key, such as iOS clearing a Home Screen app's storage, ends here too |
| The server rejects a draft (too large, bad request) | The draft stays and keeps updating locally; the status line says "Could not sync <title>: <reason>" for the open draft; no dialog; the next moment tries again |
| Server lost | The devices Create the server drafts again; devices and tokens need enrolling again; a draft deleted on one device while another was offline can reappear |
| Dictionary or ignore list fails | The chip's pop-up says "Could not sync the dictionary and ignore list"; the next Sync all or change tries again; the local lists are untouched |

## Limits

- A word removed on the other devices before a device enrolls comes back when that device still holds it: the first sync cannot tell "removed elsewhere" from "never had".
- Overwrite is the only choice that Deletes text, and the server keeps no history to restore it from.

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
