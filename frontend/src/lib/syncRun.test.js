// Sync all against an in-memory copy of the server's three draft routes (compare-and-set, tombstones, paging) and two real web stores, as
// devices A and B. The same table as docs/sync.md, "Conflicts", but through the real store and the real client calls.
import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { generateDeviceKey } from "./dpop.js";
import { listDocs } from "./syncClient.js";
import { conflictedCopy, runSync, summaryText } from "./syncRun.js";
import { createWebDrafts, openDatabase } from "./webDrafts.js";

function fakeServer() {
  const rows = new Map();
  const json = (status, body) => ({ status, json: async () => body });
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    const method = init.method;
    if (method === "GET" && u.pathname === "/docs") {
      const after = u.searchParams.get("after") ?? "";
      const limit = Number(u.searchParams.get("limit"));
      const page = [...rows.values()]
        .filter((r) => r.id > after)
        .sort((a, b) => (a.id < b.id ? -1 : 1))
        .slice(0, limit);
      return json(
        200,
        page.map(({ id, version, updatedAt, deleted }) => ({ id, version, updatedAt, deleted })),
      );
    }
    const id = u.pathname.split("/").pop();
    if (method === "GET") return rows.has(id) ? json(200, rows.get(id)) : json(404, {});
    const body = JSON.parse(init.body);
    const row = rows.get(id);
    const cur = row ? { version: row.version, updatedAt: row.updatedAt } : { version: 0, updatedAt: 0 };
    if (body.base.version !== cur.version || body.base.updatedAt !== cur.updatedAt) return json(409, { current: row });
    const next = {
      id,
      version: cur.version + 1,
      createdAt: row?.createdAt ?? body.createdAt,
      updatedAt: body.updatedAt,
      deleted: !!body.deleted,
      data: body.data,
    };
    rows.set(id, next);
    return json(200, { version: next.version });
  };
  return { rows, fetchFn };
}

const key = await generateDeviceKey();
const DEVICE = { server: "https://sync.example.com", token: "tok", ...key };

// A device: its own IndexedDB, and `sync()` to run Sync all against the shared server.
function device(server) {
  const factory = new IDBFactory();
  const open = () => {
    globalThis.indexedDB = factory;
    return openDatabase();
  };
  const drafts = createWebDrafts(open);
  return { drafts, sync: (skip) => runSync({ device: DEVICE, drafts, fetchFn: server.fetchFn, skip }) };
}
const none = { uploaded: 0, downloaded: 0, removed: 0, conflicted: 0, failed: 0, skipped: 0 };
const sum = (o) => ({ ...none, ...o });
const texts = async (d) => (await Promise.all((await d.drafts.allIds()).map((id) => d.drafts.get(id)))).map((x) => x.content).sort();
// Lets a save get a later updatedAt than the previous one.
const tick = () => new Promise((r) => setTimeout(r, 3));

test("a new draft is uploaded once, and the next run has nothing to do", async () => {
  const server = fakeServer();
  const a = device(server);
  const d = await a.drafts.save({ content: "hello" });
  assert.deepEqual(await a.sync(), sum({ uploaded: 1 }));
  assert.equal(JSON.parse(server.rows.get(d.id).data).content, "hello");
  assert.deepEqual(await a.sync(), none);
  assert.equal(summaryText(none), "Everything is up to date");
});

test("another device downloads it, and an edit travels as a plain update with no copy", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "one" });
  await a.sync();
  assert.deepEqual(await b.sync(), sum({ downloaded: 1 }));
  assert.deepEqual(await texts(b), ["one"]);
  assert.deepEqual(await b.drafts.changes(), { changed: [], deleted: [] });

  await tick();
  await a.drafts.save({ id: d.id, content: "two" });
  assert.deepEqual(await a.sync(), sum({ uploaded: 1 }));
  assert.deepEqual(await b.sync(), sum({ downloaded: 1 }));
  assert.deepEqual(await texts(b), ["two"]);
});

test("changed on both sides with different text: a conflicted copy, and nothing is lost", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "start" });
  await a.sync();
  await b.sync();
  await tick();
  await a.drafts.save({ id: d.id, content: "from A" });
  await tick(); // a state is (updatedAt, deleted), so two saves in the same millisecond would look like the same state
  await b.drafts.save({ id: d.id, content: "from B" });
  await a.sync();

  assert.deepEqual(await b.sync(), sum({ conflicted: 1 }));
  const mine = await texts(b);
  assert.equal(mine.length, 2);
  assert.ok(mine.includes("from B"));
  assert.ok(mine.some((t) => /^Conflicted copy \d{4}-\d\d-\d\d \d\d:\d\d: from A$/.test(t)));
  assert.equal(JSON.parse(server.rows.get(d.id).data).content, "from B"); // this device's text is on top
  assert.equal(server.rows.size, 2); // and the copy is an ordinary draft on the server

  assert.deepEqual(await b.sync(), none);
  assert.deepEqual(await a.sync(), sum({ downloaded: 2 })); // the other device gets the text and the copy
  assert.deepEqual(await texts(a), mine);
});

test("changed on both sides with the same text: adopted, no copy", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "start" });
  await a.sync();
  await b.sync();
  await tick();
  await a.drafts.save({ id: d.id, content: "same" });
  await b.drafts.save({ id: d.id, content: "same" });
  await a.sync();
  assert.deepEqual(await b.sync(), none);
  assert.deepEqual(await texts(b), ["same"]);
  assert.deepEqual(await b.drafts.changes(), { changed: [], deleted: [] });
});

test("a delete reaches the server as a tombstone and removes the draft on the other device", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "bye" });
  await a.sync();
  await b.sync();
  await a.drafts.remove(d.id);
  assert.deepEqual(await a.sync(), sum({ uploaded: 1 }));
  assert.equal(server.rows.get(d.id).deleted, true);
  assert.deepEqual(await b.sync(), sum({ removed: 1 }));
  assert.deepEqual(await b.drafts.allIds(), []);
  assert.deepEqual(await a.sync(), none);
  assert.deepEqual(await b.sync(), none);
});

test("an edit survives a delete elsewhere, in both directions", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "v1" });
  await a.sync();
  await b.sync();
  await a.drafts.remove(d.id);
  await a.sync();
  await tick();
  await b.drafts.save({ id: d.id, content: "edited on B" });
  assert.deepEqual(await b.sync(), sum({ uploaded: 1 })); // revives the draft on top of the tombstone
  assert.equal(server.rows.get(d.id).deleted, false);
  assert.deepEqual(await a.sync(), sum({ downloaded: 1 }));
  assert.deepEqual(await texts(a), ["edited on B"]);

  // deleted here, edited there: the edit wins
  await a.drafts.remove(d.id);
  await tick();
  await b.drafts.save({ id: d.id, content: "edited again" });
  await b.sync();
  assert.deepEqual(await a.sync(), sum({ downloaded: 1 }));
  assert.deepEqual(await texts(a), ["edited again"]);
});

test("a lost server is rebuilt from the devices", async () => {
  const server = fakeServer();
  const a = device(server);
  await a.drafts.save({ content: "one" });
  await a.drafts.save({ content: "two" });
  await a.sync();
  server.rows.clear();
  assert.deepEqual(await a.sync(), sum({ uploaded: 2 }));
  assert.equal(server.rows.size, 2);
});

test("a draft that is open is left for the next run", async () => {
  const server = fakeServer();
  const a = device(server);
  const d = await a.drafts.save({ content: "open" });
  assert.deepEqual(await a.sync(new Set([d.id])), sum({ skipped: 1 }));
  assert.equal(server.rows.size, 0);
  assert.deepEqual(await a.sync(), sum({ uploaded: 1 }));
});

test("an unreachable or refusing server stops the run", async () => {
  const a = device(fakeServer());
  await a.drafts.save({ content: "x" });
  const down = async () => {
    throw new TypeError("x");
  };
  await assert.rejects(runSync({ device: DEVICE, drafts: a.drafts, fetchFn: down }), { code: "unreachable" });
  const refuse = async () => ({ status: 401, json: async () => ({}) });
  await assert.rejects(runSync({ device: DEVICE, drafts: a.drafts, fetchFn: refuse }), { code: "signin" });
});

test("the list follows its pages", async () => {
  const rows = Array.from({ length: 501 }, (_, i) => ({ id: i.toString(16).padStart(32, "0"), version: 1, updatedAt: 1, deleted: false }));
  const fetchFn = async (url) => {
    const u = new URL(url);
    const after = u.searchParams.get("after");
    return { status: 200, json: async () => rows.filter((r) => r.id > after).slice(0, 500) };
  };
  assert.equal((await listDocs({ device: DEVICE, fetchFn })).length, 501);
});

test("the summary names only what happened", () => {
  assert.equal(
    summaryText(sum({ uploaded: 3, downloaded: 2, conflicted: 1, removed: 1 })),
    "3 uploaded, 2 downloaded, 1 conflicted copy, 1 removed",
  );
  assert.equal(summaryText(sum({ conflicted: 2, failed: 1 })), "2 conflicted copies, 1 could not be synced");
  assert.match(conflictedCopy("text", new Date(2026, 10, 5, 9, 7)), /^Conflicted copy 2026-11-05 09:07: text$/);
});
