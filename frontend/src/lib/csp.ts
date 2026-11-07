// The production page's Content-Security-Policy (docs/security.md), built for vite.config.ts. Kept here so the unit tests can check it.
// `syncOrigin` (the SYNC_ORIGIN build setting) is added to connect-src when set, and nothing else changes.

// Anything that is not a bare https origin is a build error, so a typo cannot widen the policy.
export function syncOriginOf(value?: string | null): string {
  const text = (value ?? "").trim();
  if (text === "") return "";
  let url: URL;
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

// `web` adds manifest-src: the Pages build loads its own manifest, which `default-src 'none'` would block.
export function buildPolicy({ web = false, syncOrigin = "" }: { web?: boolean; syncOrigin?: string } = {}): string {
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
