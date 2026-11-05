// End-to-end checks of the stack (see docs/ci.md): the sync service over https, readiness, the web app, and the database login. Run with
// `make e2e` from backend/. The sync flows are not tested here.
import assert from "node:assert/strict";
import { after, before, describe, test } from "node:test";
import { APP_URL, compose, launch, newDevice, SYNC_OPS_URL, SYNC_URL, waitForSync } from "./helpers.mjs";

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
    const res = await page.goto(`${SYNC_URL}/docs`); // the draft list: a request without a proof is refused, so the API is reached
    assert.equal(res?.status(), 401);
    await device.close();
  });

  test("liveness and readiness are on the ops port, not the public one", async () => {
    const live = await fetch(`${SYNC_OPS_URL}/healthz`);
    assert.equal(live.status, 200);
    assert.match(await live.text(), /ok/);
    // readiness: the sync service reaches PostgreSQL
    assert.equal((await fetch(`${SYNC_OPS_URL}/readyz`)).status, 200);
    const device = await newDevice(browser);
    const page = await device.newPage();
    for (const path of ["/healthz", "/readyz"]) {
      assert.equal((await page.goto(`${SYNC_URL}${path}`))?.status(), 404, `${path} must not be public`);
    }
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
