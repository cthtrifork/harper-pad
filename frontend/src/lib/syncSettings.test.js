// The dictionary and ignore list through createSyncer.syncSettings against an in-memory copy of the server's /settings route
// (compare-and-set on version). The last device to sync wins; a device that never synced takes the server's lists.
import assert from "node:assert/strict";
import test from "node:test";
import { generateDeviceKey } from "./dpop.ts";
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
    s.row = { version: body.baseVersion + 1, words: body.words, ignored: body.ignored };
    return json(200, { version: s.row.version });
  };
  s.lists = () => ({ words: s.row.words, ignored: s.row.ignored });
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

test("a device that never synced joins its lists with the server's: nothing is deleted on either side", async () => {
  const server = fakeServer();
  await phone(server, ["Wails", "Harper"], ["42"]).sync();
  const b = phone(server, ["Local", "Wails"], ["7"]);
  await b.sync();
  assert.deepEqual([...b.words].sort(), ["Harper", "Local", "Wails"]);
  assert.deepEqual([...b.ignored].sort(), ["42", "7"]);
  assert.deepEqual(server.lists(), { words: ["Harper", "Local", "Wails"], ignored: ["42", "7"] });
  assert.deepEqual(
    b.applied.map((c) => [c.words.remove, c.ignored.remove]),
    [[[], []]],
    "only additions were applied",
  );
  await b.sync();
  assert.equal(server.puts, 2, "the joined lists are then in step and nothing more is sent");
});

test("a device that never synced and has nothing new sends nothing", async () => {
  const server = fakeServer();
  await phone(server, ["Wails", "Harper"], ["42"]).sync();
  const b = phone(server, ["Wails"], []);
  await b.sync();
  assert.deepEqual([...b.words].sort(), ["Harper", "Wails"]);
  assert.equal(server.puts, 1);
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
    server.row = { version: server.row.version + 1, words: ["Racer"], ignored: [] };
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
  server.row = { version: 4, words: "nope", ignored: [] };
  const a = phone(server, ["Keep"]);
  await assert.rejects(a.sync(), /not readable/);
  assert.deepEqual(a.words, ["Keep"]);
  assert.equal(server.row.words, "nope");
  server.row = { version: 5, words: ["ok", "two words"], ignored: [] };
  await assert.rejects(a.sync(), /not readable/);
});

test("a failed apply is not remembered, so the next sync tries again and still deletes nothing", async () => {
  const server = fakeServer();
  await phone(server, ["Wails"], []).sync();
  const b = phone(server, ["Local"]);
  const store = { load: async () => b.record, save: async (r) => (b.record = r) };
  const engine = createSyncer({ device: DEVICE, drafts: {}, fetchFn: server.fetchFn });
  const run = (apply) => engine.syncSettings({ current: async () => ({ words: b.words, ignored: b.ignored }), store, apply });
  await assert.rejects(
    run(async () => {
      throw new Error("linter failed");
    }),
    /linter failed/,
  );
  assert.equal(b.record, null);
  assert.deepEqual(server.lists().words, ["Local", "Wails"], "the join reached the server before the apply failed");
  await run(async (c) => b.words.push(...c.words.add));
  assert.deepEqual([...b.words].sort(), ["Local", "Wails"]);
  assert.equal(server.puts, 2);
});
