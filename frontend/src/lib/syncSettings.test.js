// The dictionary and ignore list through createSyncer.syncSettings against an in-memory copy of the server's /settings route
// (compare-and-set on version). The last device to sync wins; a device that never synced takes the server's lists.
import assert from "node:assert/strict";
import test from "node:test";
import { generateDeviceKey } from "./dpop.js";
import { parseSettings, settingsData } from "./settingsItems.js";
import { createSyncer } from "./syncRun.js";

function fakeServer() {
  const s = { row: null, puts: 0, beforePut: null };
  const json = (status, body) => ({ status, json: async () => body });
  s.fetchFn = async (url, init) => {
    assert.equal(new URL(url).pathname, "/settings");
    if (init.method === "GET") return s.row ? json(200, s.row) : json(404, {});
    const body = JSON.parse(init.body);
    s.beforePut?.();
    s.beforePut = null;
    if (body.baseVersion !== (s.row?.version ?? 0)) return json(409, { current: s.row });
    s.puts++;
    s.row = { version: body.baseVersion + 1, data: body.data };
    return json(200, { version: s.row.version });
  };
  s.lists = () => parseSettings(s.row.data);
  return s;
}

const key = await generateDeviceKey();
const DEVICE = { server: "https://sync.example.com", token: "tok", ...key };

// A device: its lists (what Harper holds), its sync record, and what apply was told.
function phone(server, words = [], ignored = []) {
  const d = { words, ignored, record: null, applied: [] };
  const store = {
    load: async () => (d.record ? structuredClone(d.record) : null),
    save: async (r) => (d.record = structuredClone(r)),
  };
  const engine = createSyncer({ device: DEVICE, drafts: {}, fetchFn: server.fetchFn });
  d.sync = () =>
    engine.syncSettings({
      current: async () => ({ words: [...d.words], ignored: [...d.ignored] }),
      store,
      apply: async (c) => {
        d.applied.push(c);
        d.words = d.words.filter((w) => !c.words.remove.includes(w)).concat(c.words.add);
        d.ignored = d.ignored.filter((h) => !c.ignored.remove.includes(h)).concat(c.ignored.add);
      },
    });
  return d;
}

test("an empty server receives this device's lists; nothing is sent when nothing changed", async () => {
  const server = fakeServer();
  const a = phone(server, ["One"], ["7"]);
  await a.sync();
  assert.equal(server.puts, 1);
  assert.deepEqual(server.lists(), { words: ["One"], ignored: ["7"] });
  await a.sync();
  assert.equal(server.puts, 1);
  assert.deepEqual(a.applied, []);
});

test("a device that never synced takes the server's lists, dropping its own", async () => {
  const server = fakeServer();
  await phone(server, ["Wails", "Harper"], ["42"]).sync();
  const b = phone(server, ["Local"], ["7"]);
  await b.sync();
  assert.deepEqual([...b.words].sort(), ["Harper", "Wails"]);
  assert.deepEqual(b.ignored, ["42"]);
  assert.equal(server.puts, 1, "the enrolling device wrote nothing");
  assert.deepEqual(server.lists(), { words: ["Harper", "Wails"], ignored: ["42"] });
});

test("a change here is sent, and another device then takes it, removals included", async () => {
  const server = fakeServer();
  const a = phone(server, ["Wails", "Harper"], ["42"]);
  await a.sync();
  const b = phone(server);
  await b.sync();
  a.words = ["Wails"]; // a removes Harper and stops ignoring 42, adds a word
  a.words.push("New");
  a.ignored = [];
  await a.sync();
  assert.deepEqual(server.lists(), { words: ["New", "Wails"], ignored: [] });
  await b.sync();
  assert.deepEqual([...b.words].sort(), ["New", "Wails"]);
  assert.deepEqual(b.ignored, []);
});

test("both devices changed: the one that syncs last wins", async () => {
  const server = fakeServer();
  const a = phone(server, ["Shared"]);
  await a.sync();
  const b = phone(server);
  await b.sync();
  a.words = ["Shared", "FromA"];
  b.words = ["Shared", "FromB"];
  await a.sync();
  await b.sync();
  assert.deepEqual(server.lists().words, ["FromB", "Shared"]);
  await a.sync();
  assert.deepEqual([...a.words].sort(), ["FromB", "Shared"], "FromA is gone: that is the cost of last write wins");
});

test("a write that loses a race is read and sent again over the new version", async () => {
  const server = fakeServer();
  const a = phone(server, ["Shared"]);
  await a.sync();
  server.beforePut = () => {
    server.row = { version: server.row.version + 1, data: settingsData({ words: ["Racer"], ignored: [] }) };
  };
  a.words = ["Shared", "Mine"];
  await a.sync();
  assert.deepEqual(server.lists().words, ["Mine", "Shared"]);
  assert.equal(server.row.version, 3);
});

test("applying what the server holds does not send it back", async () => {
  const server = fakeServer();
  const a = phone(server, ["One"]);
  await a.sync();
  const b = phone(server);
  await b.sync();
  a.words = ["One", "Two"];
  await a.sync();
  await b.sync();
  await b.sync();
  assert.equal(server.puts, 2);
});

test("a server document that is garbage is refused and changes nothing", async () => {
  const server = fakeServer();
  server.row = { version: 4, data: "nope" };
  const a = phone(server, ["Keep"]);
  await assert.rejects(a.sync(), /not readable/);
  assert.deepEqual(a.words, ["Keep"]);
  assert.equal(server.row.data, "nope");
  server.row = { version: 5, data: JSON.stringify({ v: 1, words: ["ok", "two words"], ignored: [] }) };
  await assert.rejects(a.sync(), /not readable/);
});

test("a failed apply is not remembered, so the next sync tries again and does not send the old lists", async () => {
  const server = fakeServer();
  await phone(server, ["Wails"], []).sync();
  const b = phone(server, ["Local"]);
  const store = { load: async () => null, save: async (r) => (b.record = r) };
  const engine = createSyncer({ device: DEVICE, drafts: {}, fetchFn: server.fetchFn });
  await assert.rejects(
    engine.syncSettings({
      current: async () => ({ words: b.words, ignored: b.ignored }),
      store,
      apply: async () => {
        throw new Error("linter failed");
      },
    }),
    /linter failed/,
  );
  assert.equal(b.record, null);
  assert.equal(server.puts, 1);
});
