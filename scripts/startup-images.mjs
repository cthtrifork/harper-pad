// Draws the iPhone launch images (frontend/src/lib/startupImages.ts) into frontend/web/: the splash of index.html, on the page colour of
// light and dark, at each phone's size. Run it after the splash or the colours change, and commit the images:
//   node scripts/startup-images.mjs        (needs Playwright, like scripts/screenshots.mjs; SCREENSHOT_BROWSER_PATH picks a browser)
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { IPHONE_SCREENS, SCHEMES, startupImageName } from "../frontend/src/lib/startupImages.ts";

// PLAYWRIGHT_DIR (set by screenshots.sh), then the script's own resolution, then a global install, as in screenshots.mjs.
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
  return createRequire(path.join(root, "noop.js"))("playwright");
}
const { chromium } = loadPlaywright();
const root = new URL("../frontend/", import.meta.url);
const tokens = readFileSync(new URL("src/styles/tokens.css", root), "utf8");
// The light colours are the first of each in tokens.css, the dark ones the second (inside the prefers-color-scheme: dark block).
const colours = (name) => [...tokens.matchAll(new RegExp(`--${name}:\\s*(#[0-9a-f]{3,8});`, "gi"))].map((m) => m[1]);
const [bg, text] = [colours("bg"), colours("text")];
// The logo is the one in index.html's splash, so the launch image and the splash that follows it are the same picture.
const logo = /<svg[\s\S]*?<\/svg>/.exec(readFileSync(new URL("index.html", root), "utf8"))[0];

const browserPath = process.env.SCREENSHOT_BROWSER_PATH;
const browser = await chromium.launch({ executablePath: browserPath || undefined, args: browserPath ? ["--no-sandbox"] : [] });
for (const s of IPHONE_SCREENS) {
  const page = await browser.newPage({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: s.ratio });
  for (const [i, scheme] of SCHEMES.entries()) {
    await page.setContent(
      `<body style="margin:0;background:${bg[i]};color:${text[i]};font:600 20px/1.5 system-ui,sans-serif"><div style="display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;height:100vh">${logo}<span style="opacity:.6">Harper Pad</span></div>`,
    );
    await page.screenshot({ path: new URL(`web/${startupImageName(s, scheme)}`, root).pathname });
  }
  await page.close();
}
await browser.close();
