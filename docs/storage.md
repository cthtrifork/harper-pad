# Where the app keeps its data

Everything the app remembers is in **one SQLite file**, `harper-pad.db`, in the user's data folder:

| | Linux | Windows |
|---|---|---|
| `harper-pad.db` | `~/.local/share/harper-pad/` (`$XDG_DATA_HOME`) | `%LOCALAPPDATA%\harper-pad\` |

The folder comes from Wails (`application.Path(PathDataHome)`), so it follows the platform's rules. The file and its folder are private to
the user. Nothing is written for a draft until you type in it, and nothing becomes a normal file until you choose "Save as file".

It holds two things:

- **Drafts:** notes, task lists and half-written text that live inside the app.
- **Settings:** the personal dictionary and the ignored findings (so far).

`internal/store` is the package; `internal/app` (`PadService`) is its only user. The driver is the pure-Go `modernc.org/sqlite`, so there is
no cgo and the Windows build is unchanged. It adds about 4 MB to the exe (v1.61.1, SQLite 3.54.1).

## Rules

1. **All SQL lives in Go functions in `internal/store`.** Queries are constants with `?` parameters; user text is never put into SQL
   text (search escapes `%`, `_` and `\` and passes the pattern as a parameter).
2. **The frontend reaches the data only through `PadService` methods** (`ListDrafts`, `SaveDraft`, `LoadSettings`, ...), through the
   generated Wails bindings. Each method is one specific operation with typed input and output. The app registers no generic data
   service, so nothing can send SQL from JavaScript.
3. `internal/store/injection_test.go` stores, searches and looks up ten classic injection payloads (`'; DROP TABLE ...`, `' OR '1'='1`, `UNION SELECT`, ...) as draft text, ids and setting keys, and checks that they come back as plain text and that the tables are untouched.
4. These rules are tests, not just words: `internal/store/boundary_test.go` fails if SQL or a database driver import shows up outside
   `internal/store`, if `main.go` registers anything but `PadService`, if the frontend contains SQL, or if a binding looks like a
   generic query (`Exec`, `Query`, `Raw`, ...).

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
drafts   (id TEXT PRIMARY KEY, created_at INTEGER, updated_at INTEGER, data TEXT)   -- data: {"v":1,"format":"markdown","content":"..."}
settings (key TEXT PRIMARY KEY, value TEXT)                                         -- "words": ["Wails", ...]; "ignored": Harper's export
```

- Draft ids are 32 hex characters that sort by creation. Timestamps are Unix milliseconds. Titles, excerpts and the task preview are
  worked out from the content when listing, not stored.
- Settings are text values; `PadService` decides what they hold. `SetSettings` saves several in one transaction.

## Durability and safety

- SQLite's default rollback journal with full syncing: no `-wal` or `-shm` files beside the database, and a crash leaves the last
  committed state.
- **Version:** `PRAGMA user_version` is 1. A database with a higher number (written by a newer app) is refused with an error and left
  untouched, so an older build never damages newer data. Changes to the draft blob are handled with its `v` field and defaults when
  reading, so old rows keep loading.
- **Damage:** a file that is not a database or fails SQLite's quick integrity check is moved aside as `harper-pad.db.bad-<time>` and a
  fresh database is created, so the app still starts. (Drafts and settings in the damaged file are in the `.bad` copy.)
- **Input:** drafts are at most 5 MB of valid UTF-8 with a known format and a strict id. Dictionary words are single words of at most 64
  characters (10,000 at most); the ignore list must be valid JSON of at most 1 MB.
- The database opens on first use and closes when the app quits (`ServiceShutdown`).

## Drafts

`PadService.ListDrafts`, `SearchDrafts`, `GetDraft`, `SaveDraft` and `DeleteDraft`. Each list entry has a title, an excerpt and a preview
of the first three markdown task lines (`- [ ]`, `- [x]`) with done and total counts. Saving a draft whose id is no longer stored brings
it back with its creation time, which is how "undo delete" works.

Search is `LIKE` on the content (`json_extract`), with `%`, `_` and `\` taken literally. It ignores case for ASCII letters only. If
searching many drafts ever gets slow, an FTS5 index can be added alongside the table.

## Settings: the dictionary and ignored findings

Harper (`harper.js`) is the source of truth during a run. At start `lib/personal.js` loads the saved words and the ignore list into it
(`PadService.LoadSettings`), before the first check, so nothing the user already handled flashes up. After every change (**Add to
dictionary** or **Ignore this one** in the suggestion popover) it exports both lists and saves them (`SaveSettings`). The ignore list is
Harper's own export: hashes of the finding in its context, not the text.

## Why not the Wails `kvstore` or `sqlite` services

- `kvstore` writes with a plain `os.WriteFile` (not atomic) and fails the service start-up when the file is damaged, which would stop the
  app from starting. It also rewrites the whole file on every change.
- The Wails `sqlite` service lets the frontend send raw SQL. We use the same driver directly from Go, behind typed methods.
