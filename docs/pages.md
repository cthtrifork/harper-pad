# Web version on GitHub Pages

The same Vue frontend also builds as a static site, so Harper Pad can run in a browser and be added to a phone's Home Screen.
Harper itself already runs in the browser (WebAssembly in a Web Worker); what the web build replaces is the Go side.

| | Desktop | Web |
|---|---|---|
| Build | `npm run build` (embedded by Go) | `npm run build:web` (`vite build --mode web`, output `frontend/dist-web`) |
| Data | SQLite file in the user's data folder, through `DraftService` and `SettingsService` | IndexedDB in the browser (`harper-pad` database, key `settings`) |
| Updates | in-app updater (GitHub releases) | none: a new deploy is picked up on the next load |
| Offline | always | after the first load, through the service worker `web/sw.js` |

## How the two builds are kept apart

- `frontend/src/lib/backend.js` is the only place the frontend asks its host for anything (settings, version, demo banner).
  On desktop it calls the Wails bindings, imported on demand; on the web it uses IndexedDB. Add new host calls there, with both
  implementations.
- The web build does not contain the Wails runtime, the generated bindings or the update button (checked in the bundle).
- `frontend/web/` (manifest, service worker, icons) is copied to the site root by the `web-app` plugin in `vite.config.js`, which also adds the matching `<head>` tags; the desktop build gets none of it. `vite.config.js` sets the base path (`/harper-pad/`, or `BASE_PATH`), the output folder, and the Content-Security-Policy. The
  web policy is the desktop policy plus `manifest-src 'self'`, so the page may load its own manifest. Nothing else is loosened.
- Every host call needs a web implementation in `backend.js` too, or it will not work on Pages. Sync follows this: `backend.js` exports
  `syncDrafts`, IndexedDB on the web and the Go `SyncService` on desktop (`desktopSync.js`), and `syncDevice`, the device's record, which is in
  IndexedDB on both.
- **Sync origin.** The build setting `SYNC_ORIGIN` (an https origin, no path) adds the sync server to the page's `connect-src` and turns the
  chip on; `pages.yml` reads it from the repository variable of that name, and with it unset nothing changes. Previews do not set it. The
  server must list the site's origin in its `CORS_ALLOWED_ORIGINS` ([sync](sync.md)).

## Deploying

The site follows the versions of the app. `.github/workflows/pages.yml` builds the web version and `scripts/pages-publish.sh` publishes it to the `gh-pages` branch, which GitHub Pages serves:

| Path | What | Published when |
|---|---|---|
| `/` | the latest release | `release.yml` has published a final (not pre-) release; it calls `pages.yml` with the tag, which is built, not `main` |
| `/preview/` | the head of `main` | every push to `main` that touches `frontend/` |
| `/pr-<n>/` | a pull request | the `preview` label, see below |

The release build is stamped with its tag (`APP_VERSION`, set in `pages.yml`), which a phone shows small at the bottom right of the status bar. The desktop app shows its version in the header, and a preview or local build shows none.

Pull requests that touch `frontend/` only build it. To redeploy a release (a failed deploy does not undo the release), run **Pages** from the Actions tab with **Use workflow from** set to the tag; run on a branch it deploys that branch to `/preview/`.

The site is at `https://<owner>.github.io/harper-pad/`, or at the root of the repository's custom domain if Settings > Pages has one (this repository: `harper.portableinfo.cloud`, so the preview is `harper.portableinfo.cloud/preview/`). The workflow asks the Pages settings which (`actions/configure-pages`) and builds with the matching `BASE_PATH`, so changing the domain needs no code change; it needs a new deploy. Until the first release after this change, `/` still holds the last build of `main`.

### One-time setup (repository admin)

1. Open the repository on GitHub, then **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The branch does not
   exist until the first deploy: run the **Pages** workflow by hand from the Actions tab on `main` (**Run workflow**) first, then set the source.
   (Previews need this source: the **GitHub Actions** source can only publish one whole site at a time.)
3. Keep the custom domain in the same page. GitHub commits a `CNAME` file to `gh-pages`; the scripts leave it alone.
4. Create a label called `preview` (Pull requests > Labels).
5. A private repository needs a GitHub plan that includes Pages for private repos. On Free, the repository must be public. Anyone
   with the URL can open the site, whatever the repository's visibility.

Every later release and push to `main` that touches `frontend/` redeploys; nothing else to do. A deploy takes about a minute, and an installed
phone app picks it up on its next launch (the service worker fetches the page network first).

### Previews of a pull request

Add the `preview` label to a pull request and `.github/workflows/preview.yml` builds that branch with `BASE_PATH=/pr-<number>/`,
publishes it to `pr-<number>/` on `gh-pages`, and posts one sticky comment with the link
(`https://harper.portableinfo.cloud/pr-123/`). Each push to the branch updates it. Removing the label, or closing or merging the pull
request, deletes the folder. Without the label nothing is published.

- **Same origin as the real site.** (This holds for `/preview/` too, which is scoped like a `pr-<n>` preview: its keys end in `.preview` and its cache is `harper-pad-preview-v1`.) IndexedDB, localStorage and Cache Storage are shared by every path of an origin. The IndexedDB database
  (`harper-pad`, the dictionary and drafts) is deliberately shared, so a preview opens with the real data. That means a preview that
  changes the schema (`DB_VERSION` in `webDrafts.js`) upgrades the real database for the released site too. Older builds still open
  it, as long as the migration is backwards compatible: see [Changing the schema](#changing-the-schema). The presentation settings and the cache are scoped, so a preview cannot
  change the real site's look or cached files: the frontend derives a scope from the base path (`src/lib/scope.js`; `web/sw.js` does the
  same for its cache), and on `/pr-<n>/` localStorage keys end in `.pr-<n>` and the cache is `harper-pad-pr-<n>-v1`. Production names do
  not change. New localStorage keys should go through `scoped()`.
- **Branches of this repository only.** A pull request from a fork has a read-only token and is skipped. Adding the label needs triage
  access. The workflow file that runs is the one on the pull request's branch, so anyone who can push a branch here can publish to
  the site's domain; that is the same trust as write access to the repository.
- **`gh-pages` is a build output.** Nothing on it is edited by hand. It keeps its history (each deploy is a commit); if it grows too large,
  delete the branch and run **Pages** again, which recreates it (open previews come back on their next push).
- The release deploy keeps `preview/`, `pr-*/`, `CNAME` and `.nojekyll`, and replaces everything else; the `main` deploy replaces only `preview/`.

### Icons

`frontend/web` holds `icon-192.png` and `icon-512.png` (the favicon artwork with rounded corners on a transparent background),
`icon-maskable-512.png` (full square, the logo kept inside the middle 80%, for Android's adaptive icons) and
`apple-touch-icon.png` (180 px, full square and opaque: iOS fills transparency with black and rounds the corners itself). They
were rendered from `favicon.svg`; re-render them if the logo changes.

Test locally: `cd frontend && npm run build:web && npx vite preview --mode web`, then open `http://127.0.0.1:4173/harper-pad/`.

## Installing on an iPhone

Open the site in **Safari**, tap Share, then Add to Home Screen. Use that icon from then on.

The Home Screen app uses `apple-mobile-web-app-capable` with `apple-mobile-web-app-status-bar-style: default` (a status bar of its own, with
text that follows light and dark, and the page below it; `black-translucent` would draw the page under it, but reports say its text
is always white, which the light header cannot show), and `viewport-fit=cover` with `env(safe-area-inset-*)` padding (`styles/safe-area.css`) for the notch, the home
indicator and landscape; `100dvh` for the height; `theme-color` for light and dark; no page overscroll; 16 px text fields so iOS does
not zoom on focus. iOS reads the `<head>` tags when the icon is **added**, so after a change to them, delete the icon and add it again.

On an iPhone with a Dynamic Island the installed app starts the page below the status bar, but iOS fades the first stretch of the page, about 24 pt, so header buttons that start right at the top look blurry; the header is padded
by that much in the installed app (`--edge-fade` in `styles/safe-area.css`).

## Keeping the data

Browser data belongs to one site in one browser on one device.

- The Home Screen app and a Safari tab have **separate** storage, so words added in one do not appear in the other.
- Clearing website data, or deleting the Home Screen app, deletes the dictionary.
- Safari can evict data for a site that is not used for a while; an installed Home Screen app is exempt. The app also asks the
  browser to keep its data (`navigator.storage.persist()`).
- A different address (a renamed repo or owner, a custom domain) starts with empty storage.

**Back up and Restore** (in the drafts drawer, web build only) are the way to move or protect it. Back up writes one JSON file with every
draft (id, format, text, times) and the dictionary and ignore list (`frontend/src/lib/backup.js`): the share sheet on an iPhone, a download
elsewhere. Restore reads such a file and only ever adds: a draft that is not here is added, one that is older here is replaced, one that is as
new or newer here is kept, and the dictionary and ignore lists are merged. Nothing is deleted, so restoring twice is harmless. Restored drafts
count as changed for sync. File links and sync state are device-specific and are not in the file. To move to the Home Screen app: Back up in
Safari, install, then Restore in the app.

### Changing the schema

The web database has a version (`DB_VERSION` in `frontend/src/lib/webDrafts.js`) and `upgrade()` creates what is missing. A build that finds
the database at a **newer** version than its own (an older tab, an installed app that has not updated yet, or another build on the same
origin) opens it as it is, instead of failing: the browser would otherwise refuse with a `VersionError`. That is only safe if migrations
stay backwards compatible, so add stores, indexes and fields; do not rename, remove or change the meaning of existing ones. A change
that older builds cannot work with needs a new database name instead.
