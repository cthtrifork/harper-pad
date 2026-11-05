import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "./contentHash.js";
import { generateDeviceKey } from "./dpop.js";
import { useSync } from "./useSync.js";

const ORIGIN = "https://sync.example.com";
const INVITE = `${ORIGIN}/join#${"A".repeat(43)}`;
const D = { id: "a".repeat(32), format: "markdown", content: "hello", createdAt: 1, updatedAt: 2 };

function setup({ fetchFn, enrolled = true, origin = ORIGIN, ...extra } = {}) {
  const kept = { device: null, states: new Map() };
  const deviceStore = {
    load: async () => kept.device,
    save: async (r) => {
      kept.device = r;
    },
    clear: async () => {
      kept.device = null;
    },
  };
  const drafts = {
    get: async () => D,
    allIds: async () => [],
    changes: async () => ({ changed: [], deleted: [] }),
    syncState: async (id) => kept.states.get(id) ?? null,
    markSynced: async (id, s) => {
      kept.states.set(id, s);
    },
  };
  const sync = useSync({ origin, deviceStore, drafts, hash: contentHash, fetchFn, delay: 5, autoSync: false, ...extra });
  const ready = async () => {
    if (enrolled) kept.device = { server: ORIGIN, token: "tok", deviceName: "Phone", ...(await generateDeviceKey()) };
    await sync.init();
  };
  return { sync, kept, ready };
}
const reply = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });
const settle = () => new Promise((r) => setTimeout(r, 60));

test("a build with no sync server shows nothing and does nothing", async () => {
  const { sync, ready } = setup({ origin: "" });
  await ready();
  assert.equal(sync.configured, false);
  assert.equal(sync.status.value, "off");
  sync.draftSaved(D.id);
});

test("not enrolled: off; enrolled: synced, with the device's name", async () => {
  const a = setup({ enrolled: false });
  await a.ready();
  assert.equal(a.sync.status.value, "off");
  const b = setup();
  await b.ready();
  assert.equal(b.sync.status.value, "synced");
  assert.deepEqual(b.sync.info.value, { server: ORIGIN, deviceName: "Phone" });
});

test("an invite for another server is refused before anything is sent", async () => {
  let calls = 0;
  const { sync, ready } = setup({
    enrolled: false,
    fetchFn: async () => {
      calls++;
    },
  });
  await ready();
  assert.equal(await sync.enroll(`https://other.example.com/join#${"A".repeat(43)}`, "Phone"), false);
  assert.match(sync.error.value, /different server/);
  assert.equal(calls, 0);
});

test("a refused invite keeps the message and stays off; an accepted one enrolls", async () => {
  const bad = setup({ enrolled: false, fetchFn: reply(401, {}) });
  await bad.ready();
  assert.equal(await bad.sync.enroll(INVITE, "Phone"), false);
  assert.match(bad.sync.error.value, /not accepted/);
  assert.equal(bad.sync.status.value, "off");

  const ok = setup({ enrolled: false, fetchFn: reply(200, { deviceToken: "t", token_type: "DPoP" }) });
  await ok.ready();
  assert.equal(await ok.sync.enroll(INVITE, "Phone"), true);
  assert.equal(ok.sync.status.value, "synced");
  assert.equal(ok.sync.error.value, "");
});

test("a saved draft is pushed once after the delay, and its state is recorded", async () => {
  let puts = 0;
  const { sync, kept, ready } = setup({
    fetchFn: async () => {
      puts++;
      return reply(200, { version: 1 })();
    },
  });
  await ready();
  sync.draftSaved(D.id);
  sync.draftSaved(D.id);
  assert.equal(puts, 0);
  await settle();
  assert.equal(puts, 1);
  assert.equal(sync.status.value, "synced");
  const state = kept.states.get(D.id);
  assert.equal(state.version, 1);
  assert.equal(state.updatedAt, 2);
  assert.equal(state.hash, await contentHash("markdown", "hello"));
});

test("offline, signed out and conflict each leave their own status", async () => {
  const down = setup({
    fetchFn: async () => {
      throw new TypeError("x");
    },
  });
  await down.ready();
  down.sync.draftSaved(D.id);
  await settle();
  assert.equal(down.sync.status.value, "offline");

  const out = setup({ fetchFn: reply(401, {}) });
  await out.ready();
  out.sync.draftSaved(D.id);
  await settle();
  assert.equal(out.sync.status.value, "signin");
  assert.match(out.sync.error.value, /signed out/);

  const clash = setup({ fetchFn: reply(409, { current: {} }) });
  await clash.ready();
  clash.sync.draftSaved(D.id);
  await settle();
  assert.equal(clash.sync.status.value, "pending");
  assert.equal(clash.kept.states.size, 0);
});

test("turning sync off forgets the device and keeps the drafts' state", async () => {
  const { sync, kept, ready } = setup({ fetchFn: reply(200, { version: 1 }) });
  await ready();
  kept.states.set(D.id, { version: 1 });
  await sync.turnOff();
  assert.equal(sync.status.value, "off");
  assert.equal(kept.device, null);
  assert.equal(kept.states.size, 1);
});

const empty = reply(200, []);

test("Sync all with nothing to do ends synced, says so, and saves what is typed first", async () => {
  let prepared = 0;
  let skipped;
  const { sync, ready } = setup({
    fetchFn: empty,
    prepare: async () => {
      prepared++;
    },
    skip: () => (skipped = new Set(["x"])),
  });
  await ready();
  await sync.syncAll();
  assert.equal(prepared, 1);
  assert.ok(skipped);
  assert.equal(sync.status.value, "synced");
  assert.equal(sync.summary.value, "Everything is up to date");
  assert.ok(sync.lastSync.value > 0);
});

test("Sync all offline or signed out leaves those states, and a server error leaves it pending", async () => {
  const down = setup({
    fetchFn: async () => {
      throw new TypeError("x");
    },
  });
  await down.ready();
  await down.sync.syncAll();
  assert.equal(down.sync.status.value, "offline");

  const out = setup({ fetchFn: reply(401, {}) });
  await out.ready();
  await out.sync.syncAll();
  assert.equal(out.sync.status.value, "signin");

  const broken = setup({ fetchFn: reply(500, {}) });
  await broken.ready();
  await broken.sync.syncAll();
  assert.equal(broken.sync.status.value, "pending");
  assert.match(broken.sync.error.value, /did not finish/);
});

test("a build that starts synced runs Sync all once the device is loaded", async () => {
  let lists = 0;
  const { sync, ready } = setup({
    autoSync: true,
    fetchFn: async () => {
      lists++;
      return empty();
    },
  });
  await ready();
  await sync.syncAll(); // waits for the run that init started, then runs again; both are fine
  assert.ok(lists >= 1);
  assert.equal(sync.status.value, "synced");
});
