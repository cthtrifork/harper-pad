# Where the app keeps its data

Everything the app remembers is in **one SQLite file**, `harper-pad.db`, in the user's data folder, which follows the platform's rules
(`application.Path(PathDataHome)`). The file and its folder are private to the user.

| | Linux | Windows |
|---|---|---|
| `harper-pad.db` | `~/.local/share/harper-pad/` (`$XDG_DATA_HOME`) | `%LOCALAPPDATA%\harper-pad\` |

## Rules

1. **All SQL lives in Go functions in `internal/store`.** Queries are constants with `?` parameters; user text is never put into SQL text.
2. **The frontend reaches the data only through service methods in the generated Wails bindings.** Each method is one specific operation with
   typed input and output. The app registers no generic data service, so nothing can send SQL from JavaScript.

## Decisions

- **`modernc.org/sqlite`, used through `database/sql`.** The Windows exe and the release build on Linux need a build without cgo. That rules out
  `mattn/go-sqlite3`, the most used driver, which needs a C compiler at build time. `modernc.org/sqlite` is pure Go, the most used one without
  cgo, and the driver Wails' own `sqlite` service uses. `ncruces/go-sqlite3` (WebAssembly on wazero) is the alternative if modernc ever becomes a
  problem.
- **Not the Wails `kvstore` or `sqlite` services.** `kvstore` does not write atomically, fails the start-up of the app when its file is damaged,
  and rewrites the whole file on every change. The `sqlite` service lets the frontend send raw SQL (rule 2).
- **A rollback journal, not WAL.** The database is one file at rest, which is simpler to back up and sync, and a single-user app does not need
  WAL's concurrent readers.
- **Explicit protection metadata in draft summaries.** A `protected` column is derived from the stored envelope on Save and ApplyRemote.
  Listing need not read ciphertext, and protected summaries have no excerpt or tasks. The column is added to an existing database when it is
  opened, without changing draft contents or sync state. The web build keeps the same flag in its IndexedDB summaries, with no schema change.

## Safety

- A database written by a newer app is refused and left untouched, so an older build never damages newer data.
- A file that is not a database, or fails SQLite's quick integrity check, is moved aside as `harper-pad.db.bad-<time>` and an empty database is
  created, so the app still starts. The drafts in the damaged file are in the `.bad` copy.
- A draft saved to a file stays a draft. Autosave never Updates the file, the file is never renamed, and writing to an existing file keeps its
  CRLF or LF. Deleting a draft does not touch its file. The rules for a file that differs from your draft are in [sync](sync.md#other-paths-on-this-device).
