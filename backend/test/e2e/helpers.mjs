// Shared bits of the end-to-end test: where the stack listens, how to start Chromium, and the helpers the real checks
// will use. Scaffold: only the browser launch is implemented.
import { execSync, spawnSync } from "node:child_process";
import { X509Certificate, createHash } from "node:crypto";
import { createRequire } from "node:module";
import path from "node:path";

const PORT = process.env.E2E_PORT || "18443";
export const APP_URL = `https://app.localhost:${PORT}`;
export const SYNC_URL = `https://sync.localhost:${PORT}`;
// The probes (/healthz, /readyz) and /metrics are on their own port, which Caddy does not route, so they are not on SYNC_URL.
export const SYNC_OPS_URL = `http://127.0.0.1:${process.env.E2E_SYNC_OPS_PORT || "19102"}`;

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

// Runs a command in a service of the compose stack and resolves with its exit code and output, whatever the code is. COMPOSE and
// E2E_FILE come from the Makefile (`podman compose` or `docker compose`).
export function compose(service, args) {
  const [cmd, ...base] = (process.env.COMPOSE || "docker compose").split(" ");
  const file = process.env.E2E_FILE || "test/e2e/compose.yaml";
  const r = spawnSync(cmd, [...base, "-f", file, "exec", "-T", service, ...args], { encoding: "utf8" });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

// Waits until the sync service is ready (its /readyz on the ops port): it starts as soon as PostgreSQL is healthy, which can be a
// moment after the stack reports up.
export async function waitForSync(_browser, seconds = 60) {
  for (let i = 0; i < seconds; i++) {
    const res = await fetch(`${SYNC_OPS_URL}/readyz`).catch(() => null);
    if (res?.ok) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`the sync service was not ready after ${seconds} s`);
}
