# Where the app keeps its data

Everything the app remembers is in **one SQLite file**, `harper-pad.db`, in the user's data folder:

| | Linux | Windows |
|---|---|---|
| `harper-pad.db` | `~/.local/share/harper-pad/` (`$XDG_DATA_HOME`) | `%LOCALAPPDATA%\harper-pad\` |

The folder comes from Wails (`application.Path(PathDataHome)`), so it follows the platform's rules. The file and its folder are private to
the user. Nothing is written for a draft until you type in it, and nothing becomes a normal file until you choose "Save as file" (Ctrl+Shift+S).

It holds two things:

- **Drafts:** notes, task lists and half-written text that live inside the app.
- **Settings:** the personal dictionary and the ignored findings (so far).

`internal/store` is the package; `internal/app` (`DraftService`, `SyncService` and `SettingsService`, which share one connection) is its only user. The driver is the pure-Go `modernc.org/sqlite`, so there is
no cgo and the Windows build is unchanged. It adds about 4 MB to the exe.

## Rules

1. **All SQL lives in Go functions in `internal/store`.** Queries are constants with `?` parameters; user text is never put into SQL
   text (search escapes `%`, `_` and `\` and passes the pattern as a parameter).
2. **The frontend reaches the data only through `DraftService`, `SyncService` and `SettingsService` methods** (`ListDrafts`, `SaveDraft`, `LoadSettings`, ...), through the
   generated Wails bindings. Each method is one specific operation with typed input and output. The app registers no generic data
   service, so nothing can send SQL from JavaScript.

## Which SQLite package

`modernc.org/sqlite` (kept current: Renovate bumps it), used through `database/sql`.

| Package | cgo | Notes |
|---|---|---|
| `modernc.org/sqlite` | no | Transpiled SQLite in pure Go; the most used cgo-free driver. Wails' own `sqlite` service uses it too. Canonical repo is on GitLab, so GitHub stars undercount it. |
| `github.com/mattn/go-sqlite3` | **yes** | The most starred (9k) and most used overall, but it needs a C compiler at build time. Windows builds and cross-builds would need gcc, and the release would no longer build from Linux or in the current Windows job. |
| `github.com/ncruces/go-sqlite3` | no | SQLite as WebAssembly on the wazero runtime; modern and actively maintained by one author, smaller community. A reasonable alternative if modernc ever becomes a problem. |
| `zombiezen.com/go/sqlite` | no | A lower-level API on top of modernc; last release May 2025. |

We need a cgo-free build (the Windows exe and the release build on Linux depend on it), which leaves modernc and ncruces; modernc is the
more widely used and matches Wails.

## Practices in use

- Connection options on every connection: `busy_timeout` 5 s (a second instance waits for the lock instead of failing),
  `foreign_keys` on, `trusted_schema` off, and `_txlock=immediate` (a transaction takes the write lock when it begins, so it cannot
  fail halfway with `SQLITE_BUSY`).
- One connection (`SetMaxOpenConns(1)`): writes are serialised in the process.
- `STRICT` tables (types are enforced) and `WITHOUT ROWID` for the small settings table.
- Every write is a single statement or a transaction with `defer tx.Rollback()`; `rows.Close()` is always deferred.
- `PRAGMA optimize` before the database closes, as SQLite recommends.
- `PRAGMA user_version` for the schema version, and a refusal to open a newer database.
- Rollback journal rather than WAL: the database is one file at rest, which is simpler to back up and sync, and a single-user app does
  not need WAL's concurrent readers.

## Schema

```sql
drafts   (id TEXT PRIMARY KEY, created_at INTEGER, updated_at INTEGER,
          data TEXT,                                          -- the draft: {"v":1,"format":"markdown","content":"..."}
          format TEXT, title TEXT, excerpt TEXT,              -- its summary, written on every save
          tasks TEXT, tasks_total INTEGER, tasks_done INTEGER,
          file_path TEXT, file_mtime INTEGER,                 -- the file it was saved to ('' if never) and its mtime after our write (version 2)
          file_hash TEXT, file_size INTEGER)                                     -- hash of the text when it last matched the file, '' if unknown (additive, no version bump)
settings (key TEXT PRIMARY KEY, value TEXT)                   -- "words": ["Wails", ...]; "ignored": Harper's export
sync_state (id TEXT PRIMARY KEY, hash TEXT, updated_at INTEGER,   -- only for the optional sync ([sync](sync.md)): what the server held
            deleted INTEGER, version INTEGER)                     -- at the last sync; empty when sync is off; no foreign key, a row outlives its draft
```

- Draft ids are 32 hex characters that sort by creation. Timestamps are Unix milliseconds.
- **The list never reads the text.** The title, the excerpt and the first three task lines (`tasks` is JSON) with their counts are
  worked out once, when a draft is saved, and stored in their own columns. Listing selects only those columns, so it stays quick
  however many drafts there are or how large they are (a test lists 20 drafts of 1 MB and checks that it allocates almost nothing).
  Opening a draft (`Get`) is what reads its text. Search is the one query that looks into the text: it runs inside SQLite
  (`json_extract(data, '$.content') LIKE ...`), so the text is scanned there and not copied into Go. If searching gets slow with a
  very large collection, an FTS5 index can be added alongside the table.
- **A draft saved to a file stays a draft.** Ctrl+Shift+S asks for a file once (`DraftService.SaveDraftToFile`): the text is written there
  (a temporary file beside it, then a rename) and `file_path` records it. After that Ctrl+S (Sync, or Save when sync is off) writes the file, but only when the draft changed since the file was written, so an
  untouched file keeps its modified time; before a file is linked, Ctrl+S only saves the draft. The autosave never writes the file. A save never rewrites a
  draft whose text and format are what is already stored, so its timestamp only moves when the text does. If the file no longer matches the draft (changed on disk, gone, not usable) the app asks one question in the Keep or Overwrite dialog (or, when only the file changed and the draft has no edits of its own, refreshes the draft and says so): see [Linked files: when the file and the draft disagree](#linked-files-when-the-file-and-the-draft-disagree). The path is set only by `SetFilePath` after the save dialog, never taken from the page: `Save` ignores `Draft.FilePath`, and `SaveDraftToFile` reads the stored path, so the page cannot make Go write to a path it chose. Deleting a draft does not touch its file, and undoing the delete restores the text without the link.
- Settings are text values; `SettingsService` decides what they hold. `SetSettings` saves several in one transaction.

## Linked files: when the file and the draft disagree

The file is Updated only by Ctrl+S, Save as file or a choice in the Keep or Overwrite dialog; autosave never touches it. When your draft, its file
and the server disagree, that dialog decides ([sync](sync.md#the-keep-or-overwrite-dialog)). The file is never renamed. Drawer rows of drafts linked
to a file show the file name.

"No edits of its own" is a marker in the store, `drafts.file_hash` and `drafts.file_size` (not sent to the page, additive columns): the hash of the draft's text, line endings
ignored, when it last matched the file, that is when this app wrote it, reloaded it, or found it equal. `LinkedFileStatus` reports `clean` when the draft's
text still has that hash. It is cleared by `MarkFileDiffers` (used only when typing began while a refresh read the file, so the file has a version the person never saw) and unknown for drafts linked before the column existed, so both are asked about, never refreshed.
An edit that is typed and undone back to the same text is still clean. A text that a pull put into the draft is not (the hash no longer matches), so it asks.

Unlink is offered only while the header chip is struck through, by a small button beside it (`UnlinkDraftFile`: the draft and the file stay, the link goes). `LinkFile` moves a link between drafts in one transaction.

A file that is **gone or unusable** never opens the dialog (`missing`: deleted, moved, folder or drive gone; `broken`: permission denied, now a folder or not a regular file, **binary, not UTF-8 or over 1 MiB**):
the header's file chip shows the problem until a write or a look succeeds: the name struck through, a warning triangle, the title and a
screen-reader announcement "Not linked: <reason>". Ctrl+S writes a gone file again, and **refuses to overwrite a file that is not text** (`SaveDraftToFile`
checks it with or without `overwrite`, and says "<path> was not overwritten: it is not text (binary or not UTF-8)" in the status line and chip); the draft is
stored and nothing is loaded from such a file. Save as... (Ctrl+Shift+S) or fixing the file ends it. On a phone only the triangle shows. The link stays in the database, so every Ctrl+S and focus
check retries, and a failed write sets the same chip. The strike clears after a successful write or a look that finds the file usable.
For a changed file the message gives the line counts and how many lines are only in the file or only in the draft (`lineDiff`, a summary, not a diff).

When it looks: when a linked draft is opened, when the window gets focus or becomes visible (the open linked draft only, at most every 2 seconds, after
unsaved text was saved; one `stat`, and a read of at most 1 MiB only when the mtime differs), and when Ctrl+S finds a conflict. There is no file watcher.
`DraftService.LinkedFileStatus(id)` answers `none | same | changed | missing | broken` from the stored path; the page never names a path.

| Scenario | What happens | Never lost because |
|---|---|---|
| File changed outside, draft has no edits of its own since it matched the file | **Refreshed without asking** (open, focus, visibility only): the file's text replaces the draft as one undoable editor edit, and a toast says "Updated from <name>" with Undo. It goes through the normal save and is then pushed at once, as an explicit save (`onSaved` with `explicit`, like Ctrl+S, also for the manual Use file), so it syncs out without the autosave delay. Only when nothing is unsaved, being typed (IME composition included) or being saved, before and after the file is read; otherwise nothing happens and the next look tries again. Undo is the person's decision "my version wins" against that version of the file: the next Ctrl+S simply writes it (see the Undo row). | The old text is one Ctrl+Z away; the file is only read. |
| File changed outside, draft also edited (a real conflict) | Ctrl+S saves the draft, does not write the file, and opens the Keep or Overwrite dialog. | The draft is stored first; nothing is written until a choice. |
| mtime changed, text identical (touch, sync client, another editor's save) | Silent: the new mtime becomes the baseline (`LinkedFileStatus`); a save whose file already holds the old or new text is no conflict. CRLF versus LF does not count as a difference. | Nothing differs. |
| File deleted | No dialog. On open/focus the file name in the header is struck through with a warning triangle ("Not linked: file not found. Ctrl+S tries again"). Ctrl+S writes the file again (recreates it) whether or not the draft changed, and the chip returns to normal. | Recreating destroys nothing; the draft is stored first. |
| File renamed or moved | Same as deleted: the stored path is gone, and Ctrl+S recreates it at the old path. The link stays so that the next Ctrl+S or focus retries. **Save as...** (the header's Save as file, or Ctrl+Shift+S) points the draft at the new place. | As above. |
| Folder gone, drive unmounted | Same chip. Ctrl+S attempts the write and, if it fails (no folder, no drive), the chip says why ("Not linked: no such file or directory") and the status line shows the error. The link stays; the draft is stored. | The write is a temp file plus rename: no half file. |
| Permission denied (read) | No dialog: the chip is struck through ("permission denied"). Ctrl+S writes by temp file and rename, which works if the folder is writable; if not, see write. | Nothing is overwritten that was never read as text: only a *changed* file that cannot be read at all is replaced this way, and by Ctrl+S, the person's act. |
| Permission denied (write) | The save fails with "Not saved to a file: ..."; the chip is struck through with the reason; the draft is saved; the link stays and Ctrl+S tries again. | The draft is stored before the write. |
| Path is now a folder or not a regular file | Chip struck through ("now a folder" / "not a regular file"); no bar. Ctrl+S refuses to write (nothing is written) and the chip keeps the reason. Ctrl+Shift+S (Save as) links the draft to a real file. | Nothing is written. |
| File is binary (a NUL byte), not UTF-8, or over 1 MiB | No bar: the chip is struck through ("not text (binary or not UTF-8)" / "larger than 1 MiB"). Nothing is loaded from it. Ctrl+S refuses to overwrite it, with or without Overwrite, and says so; the draft is stored. When the file is text again the strike clears (a changed file then asks or refreshes as usual). | Such a file is never replaced, so nothing of it is lost. |
| File grew or shrank while open | Same as changed (mtime differs, text differs). | As above. |
| Changed while the app was in the background | The focus / visibility check opens the dialog (or refreshes a draft with no edits of its own). | As above. |
| Disk full while writing | The temp file fails, the original file is untouched; the page says "Not saved to a file: ...". Writing in place is only a fallback when no temp file can be made or renamed, never after a failed write. | The old file stays whole. |
| Two app instances (older) | They share the database, so the second one sees the first one's write as its own baseline: last writer wins on the file, and the drafts are last-writer-wins too. Not detected. | Each Ctrl+S stores the draft first. Known limit. |
| The toast's Undo (or Ctrl+Z) after an automatic refresh, then Ctrl+S | The reload recorded the file's identity (mtime, size, text hash) as the baseline. If the file is still that version, the save just writes the file: undoing was a deliberate "my version wins". If the file changed again since the reload (another mtime, size or text), it is a real conflict and the bar asks. | The file is re-read just before the write; a later outside change is never replaced silently. |
| mtime unchanged but content changed (rsync -t, a tool that restores the time) | Before every write that is not an explicit Overwrite the file is re-read and compared with the baseline (size, then text hash); a difference is a conflict (bar), also when the mtime is the same. A file whose text is the draft as stored before the save, or the text being saved, is fine. | No silent overwrite; Overwrite file is the explicit choice. Drafts linked before the hash existed are trusted while the mtime is unchanged. |
| Overwrite file, then sync pulls other text | The file keeps the overwritten text; the pull makes the draft newer than the file ("not updated (Ctrl+S)"); the next Ctrl+S writes the pulled text, asking first if the file changed. | Ctrl+S is the person's act. |
| Web build | The browser keeps a file handle, not a path. A changed file opens the same dialog without line counts: Keep writes your text and saves the file's text as a Conflicted copy only where the browser can read it; it cannot unlink a file or recover a gone one. Where only a download or share sheet exists there is no link at all. | Same rule: nothing is written until chosen. Not driven in a browser by the tests here. |
| The file is gone when Ctrl+S is pressed | The file is recreated and the status line says "Recreated <name>". | Nothing to destroy. |

Line endings: the editor and the stored draft use `\n` only, so a reload turns CRLF and lone CR into `\n`. Writing to an existing file keeps its line
endings (CRLF if its first line ends with CRLF, else `\n`); a new file, or one chosen in the save dialog, gets `\n`.

`DraftService.MarkFileDiffers(id)` records an mtime (-1) that no file has, and is used only when typing began while a quiet refresh was reading the file (the page keeps the typed text, and the next save then asks). The page calls `LinkedFileStatus`
only after saving unsaved text, so the comparison is with what is on screen.

## Durability and safety

- SQLite's default rollback journal with full syncing: no `-wal` or `-shm` files beside the database, and a crash leaves the last
  committed state.
- **Version:** `PRAGMA user_version` is 2 (1 had no `file_path`; an older database is upgraded when opened). It is the **compatibility
  level**: a database with a higher number (written by a newer app) is refused with an error and left untouched, so an older build never
  damages newer data. It is raised only for a change an older build could not live with. An additive change, such as the `sync_state`
  table, is made when the database is opened and leaves it alone, so the previous build still opens the file and ignores the table. Changes to the draft blob are handled with its `v` field and defaults when
  reading, so old rows keep loading.
- **Damage:** a file that is not a database or fails SQLite's quick integrity check is moved aside as `harper-pad.db.bad-<time>` and a
  fresh database is created, so the app still starts. (Drafts and settings in the damaged file are in the `.bad` copy.)
- **Input:** drafts are at most 1 MiB of valid UTF-8 with a known format and a strict id. Dictionary words are single words of at most 64
  characters (10,000 at most); the ignore list must be valid JSON of at most 1 MB.
- The database opens on first use and closes when the app quits (`ServiceShutdown`).

## Drafts

`DraftService.ListDrafts`, `SearchDrafts`, `GetDraft`, `SaveDraft` and `DeleteDraft`. Each list entry has a title, an excerpt and a preview
of the first three markdown task lines (`- [ ]`, `- [x]`) with done and total counts. Saving a draft whose id is no longer stored brings
it back with its creation time, which is how "undo delete" works.

Search is `LIKE` on the content (`json_extract`), with `%`, `_` and `\` taken literally. It ignores case for ASCII letters only. If
searching many drafts ever gets slow, an FTS5 index can be added alongside the table.

## Sync state

The `sync_state` table and the Go store methods that use it (`AllIDs`, `IsChanged`, `Changes`, `SyncState`, `MarkSynced`, `ApplyRemote`,
`ApplyRemoteDelete`) are what the desktop build syncs with. The page reaches them through `SyncService` (a thin binding, no SQL in the page), and
the web build keeps the same records in IndexedDB (the `sync` object store, one record per draft). The two implement one definition of a
changed draft, a hash that differs from the recorded one, and one definition of a valid draft; fixtures under `internal/store/testdata/` check
both. The device's server, token and signing key are one `sync-device` record in the webview's or browser's IndexedDB (the `kv` store) on both
builds; nothing in SQLite holds a secret. With sync off, `sync_state` stays empty. See [sync](sync.md#key-storage).

## Settings: the dictionary and ignored findings

Harper (`harper.js`) is the source of truth during a run. At start `lib/personal.js` loads the saved words and the ignore list into it
(`SettingsService.LoadSettings`), before the first check, so nothing the user already handled flashes up. After every change (**Add to
dictionary** or **Ignore this one** in the suggestion popover) it exports both lists and saves them (`SaveSettings`). The ignore list is
Harper's own export: hashes of the finding in its context, not the text.

When sync is on, the dictionary and the ignore list are also synced ([sync](sync.md#dictionary-and-ignore-list)). What the last sync
matched (the server's version and the two lists) is kept apart from the settings, in the `sync-settings` record of the IndexedDB `kv` store, on both
builds; the `settings` table and `SettingsService` are unchanged.

## Why not the Wails `kvstore` or `sqlite` services

- `kvstore` writes with a plain `os.WriteFile` (not atomic) and fails the service start-up when the file is damaged, which would stop the
  app from starting. It also rewrites the whole file on every change.
- The Wails `sqlite` service lets the frontend send raw SQL. We use the same driver directly from Go, behind typed methods.
