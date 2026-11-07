import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
// SCREENSHOT_BROWSER_PATH runs a browser binary you already have (for example a distribution's chromium) instead of Playwright's own.
const browserPath = process.env.SCREENSHOT_BROWSER_PATH;
const browser = await chromium.launch({
  channel: process.env.SCREENSHOT_BROWSER_CHANNEL || undefined,
  executablePath: browserPath || undefined,
  args: browserPath ? ["--no-sandbox"] : [],
});
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

// Open the scratch pad. Typing saves the sample as the first draft, which then shows in the list.
await page.click(".drawer-btn");
await page.waitForSelector("#drafts-drawer");
await page.locator(".cm-content").click();
await page.keyboard.press("Control+End");
await page.keyboard.type(" It is saved as you type.");
await page.waitForSelector("#drafts-drawer .item", { timeout: 15000 });
await page.waitForFunction(() => document.querySelector("#draft-status")?.textContent.trim() === "Saved", null, { timeout: 15000 });
expect((await page.locator("#drafts-drawer .item").count()) === 1, "the drafts list should hold the one draft that was typed");
await shot("04-drafts-drawer");

// A second draft, saved to a file with Ctrl+Shift+S and then edited. Real code all the way: the file is written by the Go service
// into the demo's Documents folder and the draft keeps its link in SQLite, so the list shows both drafts and the toolbar names the file.
await page.getByRole("button", { name: "New draft" }).click();
await page.locator(".cm-content").click();
await page.keyboard.type("Meeting notes");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("We agreed to ship the first release on Friday.");
await page.waitForFunction(() => document.querySelector("#draft-status")?.textContent.trim() === "Saved", null, { timeout: 15000 });
await page.keyboard.press("Control+Shift+S");
await page.waitForFunction(() => document.querySelector("#draft-status")?.textContent.trim() === "Saved to Meeting notes.md", null, { timeout: 15000 });
const filesDir = process.env.SCREENSHOT_FILES_DIR;
if (filesDir) {
  const onDisk = readFileSync(path.join(filesDir, "Meeting notes.md"), "utf8");
  expect(onDisk === "Meeting notes\n\nWe agreed to ship the first release on Friday.", `the saved file should hold the text, got ${JSON.stringify(onDisk)}`);
}
expect((await page.textContent("#file-name")) === "Meeting notes.md", "the toolbar should name the file");
expect((await page.textContent(".folder")).includes("~/Documents"), "the toolbar should show the folder as ~/Documents");
// Edit it again: the draft is autosaved, the file waits for Ctrl+S.
await page.keyboard.type(" Mikkel gets the RPM on Monday.");
await page.waitForFunction(() => document.querySelector("#draft-status")?.textContent.includes("not updated"), null, { timeout: 15000 });
// New draft closed the scratch pad; open it again for the list.
await page.keyboard.press("Control+j");
await page.waitForSelector("#drafts-drawer");
await page.waitForFunction(() => document.querySelectorAll("#drafts-drawer .item").length === 2, null, { timeout: 15000 });
if (filesDir) {
  expect(readFileSync(path.join(filesDir, "Meeting notes.md"), "utf8").endsWith("Friday."), "the file should not change until Ctrl+S");
}
// The list tells the file draft from the plain one: only the saved one names its file.
expect((await page.locator("#drafts-drawer .item .file").allTextContents()).map((t) => t.trim()).join() === "Saved to file: Meeting notes.md", "only the saved draft should name its file in the list");
await shot("05-draft-saved-to-file");

// The file changes behind the app's back while the draft holds edits of its own: the Keep or Overwrite dialog opens when the window
// takes focus again (nothing watches the file). Overwrite writes the draft's text back, so the draft is "Saved" again for what follows.
if (filesDir) {
  writeFileSync(path.join(filesDir, "Meeting notes.md"), "Meeting notes\n\nThe release moved to Monday.");
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.waitForSelector("dialog.conflict-dialog[open]", { timeout: 15000 });
  expect((await page.locator(".conflict-dialog .actions button").allTextContents()).map((t) => t.trim()).join() === "Overwrite file,Keep both", "the dialog should offer Overwrite file and Keep both");
  await shot("06-keep-or-overwrite");
  await page.getByRole("button", { name: "Overwrite file" }).click();
  await page.waitForSelector("dialog.conflict-dialog", { state: "detached", timeout: 15000 });
}

// The dictionary and the ignored findings. Close the drawer and bring the Problems panel back, write a line with a name Harper does not
// know and a typo, add the name to the dictionary and ignore the typo (the same actions as in the underline's popover), then open the
// dictionary list from the panel's footer. Part of the text is selected so the status bar shows its selection count.
await page.keyboard.press("Control+j");
await page.waitForSelector("#drafts-drawer", { state: "detached" });
await page.click(".toggle");
await page.locator(".cm-content").click(); // the focus was left on the toolbar button
await page.keyboard.press("Control+End");
await page.keyboard.press("Enter");
await page.keyboard.press("Enter");
await page.keyboard.type("Mikkel will check the build, and the sentense stays as it is. We recieve it on Friday.");
const popoverAction = async (underline, action, text) => {
  await page.locator(underline, text ? { hasText: text } : undefined).first().hover();
  await page.getByRole("button", { name: action }).click();
};
await page.waitForSelector(".cm-lintRange-error", { timeout: 15000 });
await popoverAction(".cm-lintRange-error", "Add to dictionary"); // Mikkel, the first name Harper does not know
await page.waitForFunction(() => document.querySelector(".foot")?.textContent.includes("Dictionary: 1 word"), null, { timeout: 15000 });
await popoverAction(".cm-lintRange-error", "Ignore this one", "sentense"); // the other typo, recieve, stays listed
await page.waitForFunction(() => /Ignored: [1-9]/.test(document.querySelector(".foot")?.textContent ?? ""), null, { timeout: 15000 });
await page.locator(".cm-content").click(); // the popover took the focus
await page.keyboard.press("Control+End");
await page.keyboard.down("Shift");
for (let i = 0; i < 12; i++) await page.keyboard.press("ArrowLeft");
await page.keyboard.up("Shift");
expect((await page.textContent("#selection")) === "Selection: 12 characters", "the status bar should count the 12 selected characters");
await page.getByRole("button", { name: /^Dictionary:/ }).click();
await page.waitForSelector(".entries");
expect((await page.locator(".entries li").allTextContents()).join().includes("Mikkel"), "the dictionary list should hold the added word");
await shot("07-dictionary-list");
await page.getByRole("button", { name: "Back to problems" }).click(); // show the problems again for the next picture

// A markdown draft in the Split view: the source on the left, the rendered preview on the right. The text is inserted in one go,
// because typing Enter after a list item would continue the list. Split is only available with the scratch pad closed.
await page.keyboard.press("Control+j"); // the dictionary shot left the drawer closed
await page.waitForSelector("#drafts-drawer");
await page.getByRole("button", { name: "New draft" }).click();
await page.locator(".cm-content").click();
await page.keyboard.insertText(
  [
    "# Release checklist",
    "",
    "- [x] Tag v0.1.0 when CI is green",
    "- [ ] Check the `.desktop` file under KDE Wayland",
    "- [x] Swap the placeholder icon",
    "- [ ] Confirm immutable releases are on",
    "",
    "Remember to tell **Mikkel** when the RPM is up.",
  ].join("\n"),
);
await page.waitForFunction(() => document.querySelector("#draft-status")?.textContent.trim() === "Saved", null, { timeout: 15000 });
await page.waitForSelector("#drafts-drawer", { state: "detached" }); // New draft closed the scratch pad
await page.getByRole("button", { name: "Split" }).click();
await page.waitForSelector(".md h1");
expect((await page.textContent(".md h1")) === "Release checklist", "the preview should show the heading");
expect((await page.locator(".md input[type=checkbox]").count()) === 4, "the preview should show four task boxes");
expect((await page.locator(".md input[type=checkbox]:checked").count()) === 2, "two of the tasks should be ticked");
expect((await page.locator(".md strong").textContent()) === "Mikkel", "the preview should show the bold name");
await shot("08-markdown-split");

// The same app on a phone (390 x 844, touch): below 720 px the scratch pad is a sheet over the page, Problems is a bottom sheet and
// Split stacks. A second context shares the server, so the drafts made above are in the list.
await page.close();
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
await phone.addInitScript(() => {
  document.addEventListener("DOMContentLoaded", () => {
    const style = document.createElement("style");
    style.textContent = ":root{--font-ui:Inter,sans-serif !important}";
    document.head.append(style);
  });
});
phone.on("pageerror", (e) => problems.push(`page error (phone): ${e.message}`));
const phoneShot = async (name) => {
  await phone.waitForTimeout(500);
  await phone.screenshot({ path: path.join(outDir, `${name}.png`), animations: "disabled", caret: "hide" });
  console.log(`  ${name}.png`);
};
await phone.goto(url);
// Harper is opt-in on a phone: the Problems button shows a ? and nothing is loaded until it is pressed.
await phone.waitForSelector(".status .state.off");
expect((await phone.locator(".toggle .count").innerText()) === "?", "the Problems count should be a ? until Harper is turned on");
expect((await phone.locator(".panel").count()) === 0, "Problems should start closed on a phone");
await phone.click(".toggle");
await phone.waitForSelector(".state.ready", { timeout: 60000 });
await phone.waitForSelector(".panel");
await phone.click(".toggle");
await phone.waitForSelector(".panel", { state: "detached" });
expect(!(await phone.evaluate(() => document.documentElement.scrollWidth > innerWidth)), "the phone layout should not scroll sideways");

await phone.click(".drawer-btn");
await phone.waitForSelector("#drafts-drawer .item");
expect((await phone.locator(".views").count()) === 0, "the view switcher should be hidden while the scratch pad is open");
await phoneShot("09-mobile-drafts-drawer");

// A new draft with a few mistakes, then Problems as a bottom sheet under the text.
await phone.getByRole("button", { name: "New draft" }).click();
// On a phone the sheet closes itself after New draft (App.vue pickDraft), so only wait for it to go.
await phone.waitForSelector("#drafts-drawer", { state: "detached" });
await phone.locator(".cm-content").click();
await phone.keyboard.insertText("This are a example of a sentense with with a few mistakes. Harper shuld find them.");
await phone.waitForSelector(".cm-lintRange", { timeout: 30000 });
await phone.click(".toggle");
await phone.waitForSelector(".panel li");
await phoneShot("10-mobile-problems");

// A phone's header is one row of icons, and Split is not offered there (it would stack two panes): Edit and Preview only.
await phone.click(".toggle");
await phone.waitForSelector(".panel", { state: "detached" });
expect((await phone.locator("header.bar").boundingBox()).height < 80, "the phone header should be one row");
expect((await phone.getByRole("button", { name: "Split" }).count()) === 0 || !(await phone.getByRole("button", { name: "Split" }).isVisible()), "Split should not be offered on a phone");
await phone.getByRole("button", { name: "Preview" }).click();
await phone.waitForSelector(".md");
await phoneShot("11-mobile-markdown-preview");

await browser.close();
if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
