// The dictionary and the ignore list through createSyncer.settingSet against an in-memory copy of the server's /settings route (compare-and-set on version).
import assert from "node:assert/strict";
import test from "node:test";
import { generateDeviceKey } from "./dpop.js";
import { itemsData, parseItems } from "./settingsItems.js";
import { createSyncer } from "./syncRun.js";

function fakeServer(key = "words") {
  const s = { row: null, puts: 0, beforePut: null };
  const json = (status, body) => ({ status, json: async () => body });
  s.fetchFn = async (url, init) => {
    assert.equal(new URL(url).pathname, `/settings/${key}`);
    if (init.method === "GET") return s.row ? json(200, s.row) : json(404, {});
    const body = JSON.parse(init.body);
    s.beforePut?.();
    s.beforePut = null;
    if (body.baseVersion !== (s.row?.version ?? 0)) return json(409, { current: s.row });
    s.puts++;
    s.row = { version: body.baseVersion + 1, data: body.data };
    return json(200, { version: s.row.version });
  };
  return s;
}

const key = await generateDeviceKey();
const DEVICE = { server: "https://sync.example.com", token: "tok", ...key };

// A device: its sync record in memory, a clock, and a words() call for what it holds now.
function phone(server, clock, key = "words") {
  const kept = { items: {} };
  const store = { load: async () => structuredClone(kept), save: async (r) => Object.assign(kept, structuredClone(r)) };
  const engine = createSyncer({ device: DEVICE, drafts: {}, fetchFn: server.fetchFn, now: () => new Date(clock.t) });
  return { kept, sync: (current) => engine.settingSet({ key, current, store }) };
}

test("two devices end with the union, and a removal on one is not undone by the other", async () => {
  const server = fakeServer();
  const clock = { t: 100 };
  const a = phone(server, clock);
  const b = phone(server, clock);

  assert.deepEqual(await a.sync(["Wails", "Harper"]), { add: [], remove: [] });
  clock.t = 200;
  assert.deepEqual(await b.sync(["Local"]), { add: ["Wails", "Harper"], remove: [] }); // nothing local is dropped
  assert.deepEqual(Object.keys(parseItems(server.row.data)).sort(), ["Harper", "Local", "Wails"]);

  clock.t = 300; // b removes a word; its device still has the rest
  assert.deepEqual(await b.sync(["Local", "Wails"]), { add: [], remove: [] });
  assert.equal(parseItems(server.row.data).Harper.del, true);
  clock.t = 400; // a has not synced since: it still holds Harper, and learns of the removal
  assert.deepEqual(await a.sync(["Wails", "Harper"]), { add: ["Local"], remove: ["Harper"] });
  assert.equal(parseItems(server.row.data).Harper.del, true, "the removal was not undone");

  clock.t = 500; // adding the word again later brings it back everywhere
  await a.sync(["Wails", "Local", "Harper"]);
  assert.deepEqual(await b.sync(["Local", "Wails"]), { add: ["Harper"], remove: [] });
});

test("a server that is empty just receives the words; nothing is written when nothing changed", async () => {
  const server = fakeServer();
  const a = phone(server, { t: 1 });
  await a.sync(["One"]);
  assert.equal(server.puts, 1);
  await a.sync(["One"]);
  assert.equal(server.puts, 1);
});

test("a write that loses a race is merged again", async () => {
  const server = fakeServer();
  const clock = { t: 10 };
  const a = phone(server, clock);
  const b = phone(server, clock);
  await a.sync(["Shared"]);
  server.beforePut = () => {
    server.row = { version: server.row.version + 1, data: itemsData({ ...parseItems(server.row.data), Racer: { at: 11, del: false } }) };
  };
  clock.t = 20;
  assert.deepEqual(await b.sync(["Shared", "Mine"]), { add: ["Racer"], remove: [] });
  assert.deepEqual(Object.keys(parseItems(server.row.data)).sort(), ["Mine", "Racer", "Shared"]);
});

test("a server document that is garbage removes nothing", async () => {
  const server = fakeServer();
  server.row = { version: 4, data: "nope" };
  const a = phone(server, { t: 1 });
  assert.deepEqual(await a.sync(["Keep"]), { add: [], remove: [] });
  assert.deepEqual(Object.keys(parseItems(server.row.data)), ["Keep"]);
});

test("the ignore list merges the same way, by hash", async () => {
  const server = fakeServer("ignored");
  const clock = { t: 100 };
  const a = phone(server, clock, "ignored");
  const b = phone(server, clock, "ignored");
  const H1 = "18446744073709551615"; // 64-bit: kept as text
  await a.sync([H1, "42"]);
  clock.t = 200;
  const got = await b.sync(["7"]);
  assert.deepEqual([...got.add].sort(), [H1, "42"].sort());
  assert.deepEqual(got.remove, []);
  clock.t = 300; // b stops ignoring 42
  await b.sync(["7", H1]);
  clock.t = 400;
  assert.deepEqual(await a.sync([H1, "42"]), { add: ["7"], remove: ["42"] });
  assert.equal(parseItems(server.row.data, "ignored")["42"].del, true);
});

test("a hash that is not digits is dropped from the server's ignore list", async () => {
  const server = fakeServer("ignored");
  server.row = { version: 1, data: itemsData({ abc: { at: 9, del: false }, 5: { at: 9, del: false } }) };
  const a = phone(server, { t: 1 }, "ignored");
  assert.deepEqual(await a.sync([]), { add: ["5"], remove: [] });
});
