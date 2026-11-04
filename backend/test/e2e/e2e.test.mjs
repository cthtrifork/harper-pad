// End-to-end test (docs/sync.md, "End-to-end test"). Run with `make e2e` from backend/, which builds the web app, starts the
// compose stack, runs this file and removes the stack.
//
// Scaffold: the three smoke checks run against the stub service; the real checks are listed as todo.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { APP_URL, launch, newDevice, SYNC_URL } from "./helpers.mjs";

let browser;

before(async () => {
  browser = await launch();
});

after(async () => {
  await browser?.close();
});

describe("the stack", () => {
  test("the sync service answers over https through Caddy", async () => {
    const device = await newDevice(browser);
    const page = await device.newPage();
    const res = await page.goto(`${SYNC_URL}/healthz`);
    assert.equal(res?.status(), 200);
    assert.match(await page.textContent("body"), /ok/);
    await device.close();
  });

  test("readiness: the sync service reaches PostgreSQL", async () => {
    const device = await newDevice(browser);
    const page = await device.newPage();
    const res = await page.goto(`${SYNC_URL}/readyz`);
    assert.equal(res?.status(), 200);
    await device.close();
  });

  test("the web app is served from the app origin", async () => {
    const device = await newDevice(browser);
    const page = await device.newPage();
    const res = await page.goto(`${APP_URL}/`);
    assert.equal(res?.status(), 200);
    await page.waitForSelector("#app", { state: "attached" });
    await device.close();
  });
});

describe("sync", () => {
  // The checks follow docs/sync.md, "End-to-end test". Every request carries a DPoP proof from the page's own key, so the checks
  // exercise the proof as well as the sync logic.
  test.todo("enrollment: device A pastes an invite URL and gets a token bound to its key; the same invite fails the second time");
  test.todo("save pushes: a draft made on A is in PostgreSQL shortly after the save");
  test.todo(
    "Sync all and opening a note: B, enrolled with its own invite, has the draft; an edit on A reaches B when B opens the note as a plain update with no conflicted copy; a draft created on A after B enrolled appears on B after Sync all",
  );
  test.todo("lose the server: wipe the database, restart the sync service, re-enroll both devices, and Sync all rebuilds the drafts without conflicted copies");
  test.todo(
    "later: an offline edit on both devices makes a local conflicted copy; a revoked token shows Sign in again and keeps the drafts; with a second client account, neither account sees the other's drafts or devices",
  );
});
