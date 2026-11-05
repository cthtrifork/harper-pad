// End-to-end test (docs/sync.md, "End-to-end test"). Run with `make e2e` from backend/. Scaffold: the three smoke checks run
// against the stub service; the real checks are listed as todo.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { APP_URL, compose, launch, newDevice, SYNC_URL, waitForSync } from "./helpers.mjs";

let browser;

before(async () => {
  browser = await launch();
  await waitForSync(browser);
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

describe("PostgreSQL client-certificate login (docs/sync.md, \"Database access\")", () => {
  // The sync service's own readiness check above proves that it connects with its certificate (PGSSLCERT, verify-full). These
  // check that the server refuses everything else, from inside the postgres container over TCP.
  const psql = (conn) =>
    // libpq insists on a private key with mode 0600 that the user owns, so psql runs on a copy of each key.
    compose("postgres", [
      "sh",
      "-c",
      'cp /certs/client.key /tmp/client.key; cp /certs/wrongcn.key /tmp/wrongcn.key; chmod 600 /tmp/*.key; exec psql -tA -c "select current_user" "$1"',
      "sh",
      `host=postgres dbname=harper user=harper_sync ${conn}`,
    ]);

  test("a certificate whose common name is the role is accepted", () => {
    const r = psql("sslmode=verify-full sslrootcert=/certs/ca.crt sslcert=/certs/client.crt sslkey=/tmp/client.key");
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /harper_sync/);
  });

  test("TLS without a client certificate is refused", () => {
    const r = psql("sslmode=require");
    assert.notEqual(r.code, 0, r.out);
  });

  test("a certificate with another common name is refused", () => {
    const r = psql("sslmode=require sslcert=/certs/wrongcn.crt sslkey=/tmp/wrongcn.key");
    assert.notEqual(r.code, 0, r.out);
  });

  test("TLS 1.2 is refused: the server needs 1.3", () => {
    const r = psql("sslmode=verify-full sslrootcert=/certs/ca.crt sslcert=/certs/client.crt sslkey=/tmp/client.key ssl_max_protocol_version=TLSv1.2");
    assert.notEqual(r.code, 0, r.out);
  });

  test("a connection without TLS is refused", () => {
    const r = psql("sslmode=disable");
    assert.notEqual(r.code, 0, r.out);
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
