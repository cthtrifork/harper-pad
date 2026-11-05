// Shared bits of the end-to-end test: where the stack listens, how to start Chromium, and the helpers the real checks
// will use. Scaffold: only the browser launch is implemented.
import { execSync, spawnSync } from "node:child_process";
import { X509Certificate, createHash } from "node:crypto";
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

// Caddy signs the two sites with its own local CA. Instead of ignoring every certificate error (which would hide a broken chain or a
// wrong name, and makes service workers fail), Chromium accepts chains containing Caddy's intermediate key
// (--ignore-certificate-errors-spki-list). Caddy does not send the root, so the intermediate's key is read from the running Caddy.
function caddyCaSpkiHash() {
  for (let i = 0; i < 30; i++) {
    const r = compose("caddy", ["cat", "/data/caddy/pki/authorities/local/intermediate.crt"]);
    if (r.code === 0 && r.out.includes("BEGIN CERTIFICATE")) {
      const spki = new X509Certificate(r.out.trim()).publicKey.export({ type: "spki", format: "der" });
      return createHash("sha256").update(spki).digest("base64");
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error("could not read Caddy's intermediate certificate");
}

// E2E_BROWSER_PATH points at a Chromium or Chrome binary; E2E_BROWSER_CHANNEL (for example "chrome") picks an installed one.
export async function launch() {
  const { chromium } = loadPlaywright();
  const executablePath = process.env.E2E_BROWSER_PATH || undefined;
  const channel = process.env.E2E_BROWSER_CHANNEL || undefined;
  const args = [`--ignore-certificate-errors-spki-list=${caddyCaSpkiHash()}`];
  if (executablePath) args.push("--no-sandbox");
  return chromium.launch({ executablePath, channel, args });
}

// One browser context is one device: its own IndexedDB and storage. Certificates are checked: only Caddy's CA is trusted (see launch).
export function newDevice(browser) {
  return browser.newContext();
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

// Runs a command in a service of the compose stack and resolves with its exit code and output, whatever the code is. COMPOSE and
// E2E_FILE come from the Makefile (`podman compose` or `docker compose`).
export function compose(service, args) {
  const [cmd, ...base] = (process.env.COMPOSE || "docker compose").split(" ");
  const file = process.env.E2E_FILE || "test/e2e/compose.yaml";
  const r = spawnSync(cmd, [...base, "-f", file, "exec", "-T", service, ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// Waits until the sync service answers through Caddy: it starts as soon as PostgreSQL is healthy, which can be a moment after
// the stack reports up.
export async function waitForSync(browser, seconds = 60) {
  const device = await newDevice(browser);
  const page = await device.newPage();
  try {
    for (let i = 0; i < seconds; i++) {
      const res = await page.goto(`${SYNC_URL}/readyz`).catch(() => null);
      if (res?.ok()) return;
      await page.waitForTimeout(1000);
    }
    throw new Error(`the sync service was not ready after ${seconds} s`);
  } finally {
    await device.close();
  }
}
