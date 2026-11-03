// Service worker for the web build (GitHub Pages), so Harper Pad opens offline once it has been loaded.
// It is not registered by the desktop build.
//   - Hashed files under assets/ (scripts, fonts, the Harper wasm) never change for a given name: cache first.
//   - The page itself and the manifest and icons: network first (always revalidated, not taken from the HTTP cache), so a new deploy shows up on the next load; the
//     cached copy is used when offline.
const CACHE = "harper-pad-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
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
    // "no-cache" makes the browser ask the server whether its copy is still current. A plain fetch() may be answered from the HTTP
    // cache (GitHub Pages allows it to keep a page for minutes), so a Home Screen app could keep showing the build before a deploy.
    const res = await fetch(req, { cache: "no-cache" });
    if (res.ok) await cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
