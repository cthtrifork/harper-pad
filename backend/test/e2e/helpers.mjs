// Shared bits of the end-to-end test: where the stack listens, how to start Chromium, and the helpers the real checks
// will use. Scaffold: only the browser launch is implemented.
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const PORT = process.env.E2E_PORT || "18443";
export const APP_URL = `https://app.localhost:${PORT}`;
export const SYNC_URL = `https://sync.localhost:${PORT}`;

// Same lookup order as scripts/screenshots.mjs: PLAYWRIGHT_DIR, this file's own resolution, then a global install.
function loadPlaywright() {
  const requirers = [
    process.env.PLAYWRIGHT_DIR && createRequire(path.join(process.env.PLAYWRIGHT_DIR, "noop.js")),
    createRequire(import.meta.url),
  ].filter(Boolean);
  for (const here of requirers) {
    for (const name of ["playwright", "playwright-core"]) {
      try {
        return here(name);
      } catch {}
    }
  }
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  const global = createRequire(path.join(root, "noop.js"));
  for (const name of ["playwright", "playwright-core"]) {
    try {
      return global(name);
    } catch {}
  }
  throw new Error("Playwright not found: set PLAYWRIGHT_DIR or install playwright-core globally");
}

// E2E_BROWSER_PATH points at a Chromium or Chrome binary; E2E_BROWSER_CHANNEL (for example "chrome") picks an installed one.
export async function launch() {
  const { chromium } = loadPlaywright();
  const executablePath = process.env.E2E_BROWSER_PATH || undefined;
  const channel = process.env.E2E_BROWSER_CHANNEL || undefined;
  return chromium.launch({ executablePath, channel, args: executablePath ? ["--no-sandbox"] : [] });
}

// One browser context is one device: its own IndexedDB and storage. Caddy's certificates are not trusted, hence ignoreHTTPSErrors.
export function newDevice(browser) {
  return browser.newContext({ ignoreHTTPSErrors: true });
}

// TODO: insert an invite row straight into PostgreSQL, with the same SHA-256 token hash the service uses, bound to the default
// client account (`client_id`) and with a short expiry, through `$COMPOSE -f test/e2e/compose.yaml exec -T postgres psql`. The
// admin UI is not used: it sits behind Cloudflare Access, and the admin app has no authentication of its own to skip.
export async function insertInvite(_token, _deviceName) {
  throw new Error("insertInvite is not implemented yet");
}

// TODO: wipe the database and restart the sync service, for the "lose the server" check.
export async function wipeServer() {
  throw new Error("wipeServer is not implemented yet");
}
