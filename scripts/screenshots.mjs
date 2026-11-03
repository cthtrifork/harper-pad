import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const [url, outDir] = process.argv.slice(2);
if (!url || !outDir) {
  console.error("usage: node screenshots.mjs <url> <outDir>");
  process.exit(2);
}

function loadPlaywright() {
  // PLAYWRIGHT_DIR (set by screenshots.sh), then the script's own resolution, then a global install.
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
  return createRequire(path.join(root, "noop.js"))("playwright");
}
const { chromium } = loadPlaywright();

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: process.env.SCREENSHOT_BROWSER_CHANNEL || undefined });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 2 }); // the desktop window's size, sharp
// --font-ui is system-ui, which is whatever sans font the machine has: pin it to Inter (CI installs
// fonts-inter) so the images are the same on a laptop and in CI. The document font is bundled.
await page.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = ":root{--font-ui:Inter,sans-serif !important}";
    document.head.append(style);
  });
});
const problems = [];
page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
page.on("console", (m) => m.type() === "error" && console.error(`console error: ${m.text()}`));
const expect = (cond, what) => {
  if (!cond) problems.push(`unexpected: ${what}`);
};

const shot = async (name) => {
  await page.waitForTimeout(500); // let transitions finish so the pixels are stable
  await page.screenshot({ path: path.join(outDir, `${name}.png`), animations: "disabled", caret: "hide" });
  console.log(`  ${name}.png`);
};

await page.goto(url);
await page.waitForSelector("#mode-banner", { timeout: 15000 });
expect((await page.textContent("#mode-banner")).includes("Demo mode"), "the demo banner should be visible");
await page.waitForSelector(".state.ready", { timeout: 60000 }); // harper.js loads its wasm in a worker
try {
  await page.waitForSelector(".panel li", { timeout: 30000 });
} catch (err) {
  // Say what the page looked like instead of only timing out.
  console.error(`no problems listed. Page text:\n${await page.innerText("body")}`);
  throw err;
}
const count = await page.locator(".panel li").count();
expect(count > 0, "the sample text should have problems");
const stats = await page.textContent("#doc-stats");
expect(stats === "16 words, 82 chars", `the word counter should read 16 words, 82 chars, got ${stats}`);

await shot("01-editor-with-problems");

// Apply the first suggested fix: the problem count drops by one or more.
await page.locator(".panel .fix").first().click();
await page.waitForFunction((n) => document.querySelectorAll(".panel li").length < n, count, { timeout: 15000 });
await shot("02-fix-applied");

// Hide the Problems panel.
await page.click(".toggle");
await page.waitForSelector(".panel", { state: "detached" });
await shot("03-problems-hidden");

await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
