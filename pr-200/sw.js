// Service worker for the web build (GitHub Pages), so Harper Pad opens offline after the first load. The desktop build has none.
//   - Hashed files under assets/ never change: cache first.
//   - The page, manifest and icons: network first, so a new deploy shows up on the next load.
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
  event.respondWith(hashed ? cacheFirst(req) : networkFirst(req));
});

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) await cache.put(req, res.clone());
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
