// Service worker for the web build (GitHub Pages), so Harper Pad opens offline after the first load. The desktop build has none.
//   - Hashed files under assets/ never change: cache first.
//   - The page, manifest and icons: from the cache at once, refreshed in the background, so a new deploy shows up one launch later.
//     A new page is stored only after every asset it can reach is cached too (a release deletes the old assets/ from the site).
//   - Previews (/preview/, /pr-<number>/) share the origin and its Cache Storage with production, so each gets its own cache name
//     and a worker only deletes the caches of its own site.
const PREVIEW = /\/(pr-\d+|preview)\/$/.exec(self.registration.scope)?.[1] ?? "";
const CACHE = PREVIEW ? `harper-pad-${PREVIEW}-v1` : "harper-pad-v1";
const isOwn = (key) =>
  PREVIEW ? key.startsWith(`harper-pad-${PREVIEW}-`) : key.startsWith("harper-pad-") && !/^harper-pad-(pr-\d+|preview)-/.test(key);

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE && isOwn(key)) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const hashed = url.pathname.includes("/assets/");
  event.respondWith(hashed ? cacheFirst(req) : staleWhileRevalidate(event));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

// The page, manifest and icons: answer from the cache at once and refresh it in the background, so a launch never waits on the
// network (on a slow connection the old network-first order held the first paint for the full page response). A new deploy is
// fetched during this launch and shown on the next one. Without a cached copy (first visit) it is the network, as before.
async function staleWhileRevalidate(event) {
  const req = event.request;
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  const fetched = fetch(req);
  event.waitUntil(fetched.then((res) => store(cache, req, res.clone())).catch(() => {}));
  return hit ?? fetched;
}

// A release deletes the old assets/ from the site, and the new page names only the entry files (the rest are lazy chunks, the worker
// and the wasm inside them). So a new page is kept only once everything it can reach is cached: otherwise one launch later it would
// open offline without its scripts, or fail to load a chunk. If any file fails, the old page stays and the next launch tries again.
// Then the assets neither this page nor the one it replaces can reach are deleted.
// Inside a chunk a neighbour is `./name.js`, in the entry's preload list and in the page it is `assets/name.js`.
const ASSET = /(?:\.\/|assets\/)[\w.-]+\.(?:js|css|wasm|woff2?|svg|png|jpe?g|webp)/g;

async function store(cache, req, res) {
  if (!res.ok) return;
  if (res.headers.get("content-type")?.includes("text/html")) {
    const html = await res.clone().text();
    const old = await cache.match(req, { ignoreSearch: true });
    const oldHtml = old && (await old.text());
    if (oldHtml === html) return;
    const keep = await cacheAssets(cache, html, true);
    await cache.put(req, res);
    await prune(cache, keep, oldHtml);
    return;
  }
  await cache.put(req, res);
}

// Release by release the old assets/ would pile up in the cache. Once the new page is stored, drop what neither it nor the page it
// replaces can reach. The replaced page is kept because it may still be open and load a lazy chunk; the next launch shows the new one.
async function prune(cache, keep, oldHtml) {
  try {
    if (oldHtml) for (const url of await cacheAssets(cache, oldHtml, false)) keep.add(url);
    for (const key of await cache.keys()) if (new URL(key.url).pathname.includes("/assets/") && !keep.has(key.url)) await cache.delete(key);
  } catch {} // best effort: leaving old files in the cache is harmless
}

// Every file reachable from the page text, as a set of URLs. `online`: fetch what is not cached; without it only the cached files are
// followed. A file the page names itself must exist (an error stops the walk). A name found inside a script is only a guess (a wasm
// import module is called "./harper_wasm_slim_bg.js", for one), so when it is not on the site it is left out.
async function cacheAssets(cache, text, online) {
  const scope = self.registration.scope;
  const queue = [...text.matchAll(ASSET)].map((m) => ({ url: new URL(m[0], scope).href, named: true }));
  const seen = new Set();
  while (queue.length && seen.size < 500) {
    const { url, named } = queue.shift();
    if (seen.has(url)) continue;
    let res = await cache.match(url);
    if (!res) {
      if (!online) continue;
      res = await fetch(url);
      if (!res.ok) {
        if (named) throw new Error(`${res.status} ${url}`);
        continue;
      }
      await cache.put(url, res.clone());
    }
    seen.add(url);
    if (/\.(?:js|css)$/.test(url)) {
      for (const m of (await res.text()).matchAll(ASSET)) {
        queue.push({ url: new URL(m[0], m[0].startsWith("./") ? url : scope).href, named: false });
      }
    }
  }
  return seen;
}
