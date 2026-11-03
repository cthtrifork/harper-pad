# Where the app keeps its data

The app writes small JSON files for the user, never anything the user did not ask it to keep.

| File | Holds | Linux | Windows |
|---|---|---|---|
| `settings.json` | the personal dictionary and the ignored findings | `~/.config/harper-pad/` (`$XDG_CONFIG_HOME`) | `%LOCALAPPDATA%\harper-pad\` |

The folders come from Wails (`application.Path(application.PathConfigHome)`), so they follow the platform's rules. Drafts will go
in the user's data folder (`PathDataHome`, `~/.local/share/harper-pad/drafts/` on Linux, the same `%LOCALAPPDATA%` folder on
Windows) when they exist; see `TODO.md`.

## How it is written

`internal/store` does the file work: it writes to a temporary file in the same folder and renames it over the target, so a crash
leaves the old file or the new one, never half of one. Folders are private to the user (0700) and files 0600. A file that cannot
be parsed is moved aside as `settings.json.bad` and the app starts with empty settings, so a damaged file never stops it.

`PadService.LoadSettings` and `SaveSettings` (`internal/app/settings.go`) are the only entry points. `SaveSettings` checks its input:
words are single words of at most 64 characters (10,000 at most), and the ignore list must be valid JSON of at most 1 MB.

## How the frontend uses it

Harper (`harper.js`) is the source of truth during a run. At start `lib/personal.js` loads the saved words and the ignore list into
it, before the first check, so nothing the user already handled flashes up. After every change (**Add to dictionary** or **Ignore
this one** in the suggestion popover) it exports both lists and saves them. The ignore list is Harper's own export: hashes of the
finding in its context, not the text.

## Why not the Wails `kvstore` or `sqlite` services

- `kvstore` writes with a plain `os.WriteFile` (not atomic) and fails the service start-up when the file is damaged, which would stop
  the app from starting. It also rewrites the whole file on every change.
- `sqlite` is pure Go, so it would work on Windows, but it exposes raw SQL to the frontend and is more than a few small files need.
  It becomes worth a look if searching many drafts gets slow.
