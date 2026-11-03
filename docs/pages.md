# Web version on GitHub Pages

The same Vue frontend also builds as a static site, so Harper Pad can run in a browser and be added to a phone's Home Screen.
Harper itself already runs in the browser (WebAssembly in a Web Worker); what the web build replaces is the Go side.

| | Desktop | Web |
|---|---|---|
| Build | `npm run build` (embedded by Go) | `npm run build:web` (`vite build --mode web`, output `frontend/dist-web`) |
| Data | SQLite file in the user's data folder, through `PadService` | IndexedDB in the browser (`harper-pad` database, key `settings`) |
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

`.github/workflows/pages.yml` builds the web version on every pull request that touches `frontend/`, and deploys it on pushes to
`main`. The site is at `https://<owner>.github.io/harper-pad/`.

### One-time setup (repository admin)

1. Open the repository on GitHub, then **Settings > Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**. Do not pick "Deploy from a branch".
3. Merge the pull request that adds `pages.yml` (or run the **Pages** workflow by hand from the Actions tab on `main`: **Run workflow**).
4. Open the **Pages** workflow run. The `deploy` job prints the site URL, and the same URL appears under Settings > Pages.
5. If the `deploy` job fails with "Environment protection rules", open Settings > Environments > `github-pages` and allow the `main` branch.
6. A private repository needs a GitHub plan that includes Pages for private repos. On Free, the repository must be public. Anyone
   with the URL can open the site, whatever the repository's visibility.

Every later push to `main` that touches `frontend/` redeploys; nothing else to do. A deploy takes about a minute, and an installed
phone app picks it up on its next launch (the service worker fetches the page network first).

### Icons

`frontend/web` holds `icon-192.png` and `icon-512.png` (the favicon artwork with rounded corners on a transparent background),
`icon-maskable-512.png` (full square, the logo kept inside the middle 80%, for Android's adaptive icons) and
`apple-touch-icon.png` (180 px, full square and opaque: iOS fills transparency with black and rounds the corners itself). They
were rendered from `favicon.svg`; re-render them if the logo changes.

Test locally: `cd frontend && npm run build:web && npx vite preview --mode web`, then open `http://127.0.0.1:4173/harper-pad/`.

## Installing on an iPhone

Open the site in **Safari**, tap Share, then Add to Home Screen. Use that icon from then on.

## Keeping the data

Browser data belongs to one site in one browser on one device.

- The Home Screen app and a Safari tab have **separate** storage, so words added in one do not appear in the other.
- Clearing website data, or deleting the Home Screen app, deletes the dictionary.
- Safari can evict data for a site that is not used for a while; an installed Home Screen app is exempt. The app also asks the
  browser to keep its data (`navigator.storage.persist()`).
- A different address (a renamed repo or owner, a custom domain) starts with empty storage.

There is no export or import yet. The dictionary is small, but if it matters, add one before relying on the web version.
