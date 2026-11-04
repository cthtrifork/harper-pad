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
- The drafts backend (`ListDrafts`, `SaveDraft`, ...) has no frontend yet. When the drawer is built, give it a web implementation
  in `backend.js` too, or it will not work on Pages.

## Deploying

`.github/workflows/pages.yml` builds the web version on every pull request that touches `frontend/`, and on pushes to `main` publishes
it to the root of the `gh-pages` branch with `scripts/pages-publish.sh`, which GitHub Pages serves. The site is at
`https://<owner>.github.io/harper-pad/`, or at the root of the repository's custom domain if Settings > Pages has one (this repository: `harper.portableinfo.cloud`). The workflow asks the Pages settings which (`actions/configure-pages`) and builds with the matching `BASE_PATH`, so changing the domain needs no code change; it needs a new deploy.

### One-time setup (repository admin)

1. Open the repository on GitHub, then **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**, branch `gh-pages`, folder `/ (root)`. The branch does not
   exist until the first deploy: run the **Pages** workflow by hand from the Actions tab on `main` (**Run workflow**) first, then set the source.
   (Previews need this source: the **GitHub Actions** source can only publish one whole site at a time.)
3. Keep the custom domain in the same page. GitHub commits a `CNAME` file to `gh-pages`; the scripts leave it alone.
4. Create a label called `preview` (Pull requests > Labels).
5. A private repository needs a GitHub plan that includes Pages for private repos. On Free, the repository must be public. Anyone
   with the URL can open the site, whatever the repository's visibility.

Every later push to `main` that touches `frontend/` redeploys; nothing else to do. A deploy takes about a minute, and an installed
phone app picks it up on its next launch (the service worker fetches the page network first).

### Previews of a pull request

Add the `preview` label to a pull request and `.github/workflows/preview.yml` builds that branch with `BASE_PATH=/pr-<number>/`,
publishes it to `pr-<number>/` on `gh-pages`, and posts one sticky comment with the link
(`https://harper.portableinfo.cloud/pr-123/`). Each push to the branch updates it. Removing the label, or closing or merging the pull
request, deletes the folder. Without the label nothing is published.

- **Same origin as the real site.** IndexedDB, localStorage and Cache Storage are shared by every path of an origin. The IndexedDB database
  (`harper-pad`, the dictionary and drafts) is deliberately shared, so a preview opens with the real data. That means a preview that
  changes the schema (`DB_VERSION` in `webDrafts.js`) upgrades the real database, and the released site then fails to open it: do not
  bump the version in a branch you preview against real data. The presentation settings and the cache are scoped, so a preview cannot
  change the real site's look or cached files: the frontend derives a scope from the base path (`src/lib/scope.js`; `web/sw.js` does the
  same for its cache), and on `/pr-<n>/` localStorage keys end in `.pr-<n>` and the cache is `harper-pad-pr-<n>-v1`. Production names do
  not change. New localStorage keys should go through `scoped()`.
- **Branches of this repository only.** A pull request from a fork has a read-only token and is skipped. Adding the label needs triage
  access. The workflow file that runs is the one on the pull request's branch, so anyone who can push a branch here can publish to
  the site's domain; that is the same trust as write access to the repository.
- **`gh-pages` is a build output.** Nothing on it is edited by hand. It keeps its history (each deploy is a commit); if it grows too large,
  delete the branch and run **Pages** again, which recreates it (open previews come back on their next push).
- The site deploy keeps `pr-*/`, `CNAME` and `.nojekyll`, and replaces everything else.

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

There is no export or import yet. The dictionary is small, but if it matters, add one before relying on the web version.
