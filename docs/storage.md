# Where the app keeps its data

The app writes small JSON files for the user, never anything the user did not ask it to keep.

| File | Holds | Linux | Windows |
|---|---|---|---|
| `settings.json` | the personal dictionary and the ignored findings | `~/.config/harper-pad/` (`$XDG_CONFIG_HOME`) | `%LOCALAPPDATA%\harper-pad\` |
| `drafts.db` | the drafts (SQLite) | `~/.local/share/harper-pad/` (`$XDG_DATA_HOME`) | `%LOCALAPPDATA%\harper-pad\` |

The folders come from Wails (`application.Path(PathConfigHome)` and `PathDataHome`), so they follow the platform's rules.

## How it is written

`internal/store` does the file work: it writes to a temporary file in the same folder and renames it over the target, so a crash
leaves the old file or the new one, never half of one. Folders are private to the user (0700) and files 0600. A file that cannot
be parsed is moved aside as `settings.json.bad` and the app starts with empty settings, so a damaged file never stops it.

`PadService.LoadSettings` and `SaveSettings` (`internal/app/settings.go`) are the only entry points. `SaveSettings` checks its input:
words are single words of at most 64 characters (10,000 at most), and the ignore list must be valid JSON of at most 1 MB.

## Drafts

Drafts are notes, task lists and half-written text that stay inside the app until the user saves one as a file. `internal/drafts`
keeps them in one SQLite file, using the pure-Go driver `modernc.org/sqlite` (no cgo, so it builds for Windows from anywhere; it adds
about 3.5 MB to the exe).

- **Schema:** one table, `drafts(id, created_at, updated_at, data)`. `data` is a JSON blob, `{"v":1,"format":"markdown","content":"..."}`.
  Titles, excerpts and the task preview are worked out from the content when listing, not stored. Ids are 32 hex characters that
  sort by creation time. Timestamps are Unix milliseconds.
- **Durability:** SQLite's default rollback journal with full syncing, so there are no `-wal` or `-shm` files beside the database
  and a crash leaves the last committed state. The file and folder are private to the user.
- **Version:** `PRAGMA user_version` is 1. A database with a higher number (written by a newer app) is refused with an error and left
  untouched, so an older version never damages newer data. Changes to the blob are handled with the `v` field and defaults when
  reading, so old rows keep loading.
- **Damage:** a file that is not a database or fails SQLite's quick integrity check is moved aside as `drafts.db.bad-<time>`
  and a fresh database is created, so the app still starts.
- **Search:** `LIKE` on the content (`json_extract`), with `%`, `_` and `\` taken literally. It ignores case for ASCII letters only. If
  searching many drafts ever gets slow, an FTS5 index can be added alongside the table.
- **Service:** `PadService.ListDrafts`, `SearchDrafts`, `GetDraft`, `SaveDraft` and `DeleteDraft`. Saving a draft whose id is no
  longer stored brings it back with its creation time, which is how "undo delete" works. The database opens on first use and closes
  when the app quits (`ServiceShutdown`).

## How the frontend uses settings

Harper (`harper.js`) is the source of truth during a run. At start `lib/personal.js` loads the saved words and the ignore list into
it, before the first check, so nothing the user already handled flashes up. After every change (**Add to dictionary** or **Ignore
this one** in the suggestion popover) it exports both lists and saves them. The ignore list is Harper's own export: hashes of the
finding in its context, not the text.

## Why not the Wails `kvstore` or `sqlite` services

- `kvstore` writes with a plain `os.WriteFile` (not atomic) and fails the service start-up when the file is damaged, which would stop
  the app from starting. It also rewrites the whole file on every change.
- The Wails `sqlite` service lets the frontend send raw SQL. We use the same driver directly from Go, behind typed methods.
