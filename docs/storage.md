# Where the app keeps its data

Everything the app remembers is in **one SQLite file**, `harper-pad.db`, in the user's data folder:

| | Linux | Windows |
|---|---|---|
| `harper-pad.db` | `~/.local/share/harper-pad/` (`$XDG_DATA_HOME`) | `%LOCALAPPDATA%\harper-pad\` |

The folder comes from Wails (`application.Path(PathDataHome)`), so it follows the platform's rules. The file and its folder are private to
the user. Nothing is written for a draft until you type in it, and nothing becomes a normal file until you choose "Save to disk" (Ctrl+Shift+S).

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
          file_path TEXT, file_mtime INTEGER)                 -- the file it was saved to ('' if never) and its mtime after our write (version 2)
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
  draft whose text and format are what is already stored, so its timestamp only moves when the text does. If the file was changed by something else since our last write (its mtime differs from `file_mtime`), Ctrl+S saves the draft but not the file and says so; the next Ctrl+S replaces it. A file that was deleted is written again. The path is set only by `SetFilePath` after the save dialog, never taken from
  the page: `Save` ignores `Draft.FilePath`, and `SaveDraftToFile` reads the stored path, so the page cannot make Go write to a path it
  chose. Deleting a draft does not touch its file, and undoing the delete restores the text without the link.
- Settings are text values; `SettingsService` decides what they hold. `SetSettings` saves several in one transaction.

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
builds; nothing in SQLite holds a secret. With sync off, `sync_state` stays empty. See [sync](sync.md#changes-to-local-storage).

## Settings: the dictionary and ignored findings

Harper (`harper.js`) is the source of truth during a run. At start `lib/personal.js` loads the saved words and the ignore list into it
(`SettingsService.LoadSettings`), before the first check, so nothing the user already handled flashes up. After every change (**Add to
dictionary** or **Ignore this one** in the suggestion popover) it exports both lists and saves them (`SaveSettings`). The ignore list is
Harper's own export: hashes of the finding in its context, not the text.

When sync is on, the dictionary and the ignore list are also synced ([sync](sync.md#settings-the-dictionary-and-the-ignore-list)). What the last sync
matched (the server's version and the two lists) is kept apart from the settings, in the `sync-settings` record of the IndexedDB `kv` store, on both
builds; the `settings` table and `SettingsService` are unchanged.

## Why not the Wails `kvstore` or `sqlite` services

- `kvstore` writes with a plain `os.WriteFile` (not atomic) and fails the service start-up when the file is damaged, which would stop the
  app from starting. It also rewrites the whole file on every change.
- The Wails `sqlite` service lets the frontend send raw SQL. We use the same driver directly from Go, behind typed methods.
