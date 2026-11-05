// The Content-Security-Policy of the production page, built for vite.config.js (a build-time file; the app never imports it). Kept here,
// not in the config, so the unit tests can check it. See docs/security.md for what each directive is for.
//
// `syncOrigin` is the sync server's origin, from the SYNC_ORIGIN build setting (docs/sync.md). Empty means sync is not configured, and then
// the policy is exactly what it was before sync existed: connect-src 'self'. When set, it is added to connect-src and nothing else changes.

// "https://sync.example.com" -> the same. "" -> "". Anything that is not a bare https origin is a build error, so a typo cannot widen the
// policy (a path, a wildcard or a scheme-only value would).
export function syncOriginOf(value) {
  const text = (value ?? "").trim();
  if (text === "") return "";
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`SYNC_ORIGIN "${text}" is not a URL`);
  }
  if (url.protocol !== "https:" || url.origin !== text.replace(/\/$/, "") || /[;,\s*]/.test(text)) {
    throw new Error(`SYNC_ORIGIN "${text}" must be an https origin such as https://sync.example.com, with no path`);
  }
  return url.origin;
}

// `web` adds manifest-src: the GitHub Pages build loads its own web app manifest, which `default-src 'none'` would block.
export function buildPolicy({ web = false, syncOrigin = "" } = {}) {
  const origin = syncOriginOf(syncOrigin);
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self'",
    origin ? `connect-src 'self' ${origin}` : "connect-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    ...(web ? ["manifest-src 'self'"] : []),
  ].join("; ");
}
