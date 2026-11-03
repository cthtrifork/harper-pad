# Web version on GitHub Pages

The same Vue frontend also builds as a static site, so Harper Pad can run in a browser and be added to a phone's Home Screen.
Harper itself already runs in the browser (WebAssembly in a Web Worker); what the web build replaces is the Go side.

| | Desktop | Web |
|---|---|---|
| Build | `npm run build` (embedded by Go) | `npm run build:web` (`vite build --mode web`, output `frontend/dist-web`) |
| Data | SQLite file in the user's data folder, through `PadService` | IndexedDB in the browser (`harper-pad` database, key `settings`) |
| Updates | in-app updater (GitHub releases) | none: a new deploy is picked up on the next load |
| Offline | always | after the first load, through the service worker `public/sw.js` |

## How the two builds are kept apart

- `frontend/src/lib/backend.js` is the only place the frontend asks its host for anything (settings, version, demo banner).
  On desktop it calls the Wails bindings, imported on demand; on the web it uses IndexedDB. Add new host calls there, with both
  implementations.
- The web build does not contain the Wails runtime, the generated bindings or the update button (checked in the bundle).
- `vite.config.js` sets the base path (`/harper-pad/`, or `BASE_PATH`), the output folder, and the Content-Security-Policy. The
  web policy is the desktop policy plus `manifest-src 'self'`, so the page may load its own manifest. Nothing else is loosened.
- The drafts backend (`ListDrafts`, `SaveDraft`, ...) has no frontend yet. When the drawer is built, give it a web implementation
  in `backend.js` too, or it will not work on Pages.

## Deploying

`.github/workflows/pages.yml` builds the web version on every pull request that touches `frontend/`, and deploys it on pushes to
`main`. One-time setup: Settings > Pages > Build and deployment > Source: **GitHub Actions**. The site is at
`https://<owner>.github.io/harper-pad/`.

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
