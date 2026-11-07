// Sync all against an in-memory copy of the server's three draft routes (compare-and-set, tombstones, paging) and two real web stores, as
// devices A and B. The same table as docs/sync.md, "Conflicts", but through the real store and the real client calls.
import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { generateDeviceKey } from "./dpop.js";
import { listDocs } from "./syncClient.js";
import { conflictedCopy, createSyncer, summaryText } from "./syncRun.js";
import { createWebDrafts, openDatabase } from "./webDrafts.js";

function fakeServer() {
  const rows = new Map();
  const json = (status, body) => ({ status, json: async () => body });
  const calls = [];
  const fetchFn = async (url, init) => {
    const u = new URL(url);
    const method = init.method;
    calls.push(`${method} ${u.pathname}`);
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
    if (method === "GET") {
      const row = rows.get(id);
      if (!row) return json(404, {});
      // The server's validator is "<updatedAt>-<0|1>"; a matching If-None-Match is a 304 with no body.
      if (init.headers["If-None-Match"] === `"${row.updatedAt}-${row.deleted ? 1 : 0}"`)
        return { status: 304, json: async () => Promise.reject(new Error("no body")) };
      return json(200, row);
    }
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
  return { rows, fetchFn, calls };
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
  const copies = []; // the conflicted copies the engine reported
  const gone = []; // the ids Sync all left alone because they were deleted elsewhere
  const syncer = () =>
    createSyncer({ device: DEVICE, drafts, fetchFn: server.fetchFn, onCopy: (c) => copies.push(c), onGone: (id) => gone.push(id) });
  // sync() is Sync all; one(id) is the push after a save. Both are the same engine.
  return {
    drafts,
    copies,
    gone,
    keep: (id) => syncer().keep(id),
    removeLocal: (id) => syncer().removeLocal(id),
    sync: (skip) => syncer().all({ skip }),
    one: (id) => syncer().one(id),
    open: (id, o) => syncer().open(id, o),
  };
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
  await assert.rejects(createSyncer({ device: DEVICE, drafts: a.drafts, fetchFn: down }).all(), { code: "unreachable" });
  const refuse = async () => ({ status: 401, json: async () => ({}) });
  await assert.rejects(createSyncer({ device: DEVICE, drafts: a.drafts, fetchFn: refuse }).all(), { code: "signin" });
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
  assert.equal(summaryText(sum({ conflicted: 2, failed: 1 })), "2 conflicted copies, 1 failed");
  assert.match(conflictedCopy("text", new Date(2026, 10, 5, 9, 7)), /^Conflicted copy 2026-11-05 09:07: text$/);
});

// The push after a save goes through the same engine as Sync all, so it settles conflicts by the same rules.
test("a save is pushed with one request, and nothing is listed", async () => {
  const server = fakeServer();
  const a = device(server);
  const d = await a.drafts.save({ content: "one" });
  assert.equal(await a.one(d.id), "uploaded");
  assert.deepEqual(server.calls, [`PUT /docs/${d.id}`]);
  assert.equal(await a.one(d.id), ""); // not changed since: nothing is sent
  assert.equal(server.calls.length, 1);
  await tick();
  await a.drafts.save({ id: d.id, content: "two" });
  assert.equal(await a.one(d.id), "uploaded");
  assert.equal(JSON.parse(server.rows.get(d.id).data).content, "two");
});

test("a save that finds the server changed makes the same conflicted copy as Sync all", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "start" });
  await a.sync();
  await b.sync();
  await tick();
  await a.drafts.save({ id: d.id, content: "from A" });
  assert.equal(await a.one(d.id), "uploaded");
  await tick();
  await b.drafts.save({ id: d.id, content: "from B" });
  assert.equal(await b.one(d.id), "conflicted"); // the PUT is refused, the real state is read, and the rules of Sync all apply
  const mine = await texts(b);
  assert.equal(mine.length, 2);
  assert.ok(mine.includes("from B"));
  assert.ok(mine.some((t) => /^Conflicted copy .*: from A$/.test(t)));
  assert.equal(JSON.parse(server.rows.get(d.id).data).content, "from B");
  assert.equal(server.rows.size, 2);
  assert.deepEqual(await b.sync(), none);
});

test("a save that finds the same text on the server adopts it, and one that finds the server empty uploads", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "start" });
  await a.sync();
  await b.sync();
  await tick();
  await a.drafts.save({ id: d.id, content: "same" });
  await a.one(d.id);
  await tick();
  await b.drafts.save({ id: d.id, content: "same" });
  assert.equal(await b.one(d.id), "");
  assert.deepEqual(await b.drafts.changes(), { changed: [], deleted: [] });

  server.rows.clear();
  await tick();
  await a.drafts.save({ id: d.id, content: "after the loss" });
  assert.equal(await a.one(d.id), "uploaded");
  assert.equal(JSON.parse(server.rows.get(d.id).data).content, "after the loss");
});

// Opening a note: the same table, one conditional request.
test("opening a note that has not changed on the server is one request and a 304", async () => {
  const server = fakeServer();
  const a = device(server);
  const d = await a.drafts.save({ content: "one" });
  await a.sync();
  server.calls.length = 0;
  assert.equal(await a.open(d.id), "none");
  assert.deepEqual(server.calls, [`GET /docs/${d.id}`]);
});

test("opening a note that is newer on the server swaps it in when nothing was typed", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "one" });
  await a.sync();
  await b.sync();
  await tick();
  await a.drafts.save({ id: d.id, content: "two" });
  await a.one(d.id);

  assert.equal(await b.open(d.id, { canSwap: () => false }), "newer"); // typed meanwhile: shown as a marker, nothing replaced
  assert.deepEqual(await texts(b), ["one"]);
  assert.equal(await b.open(d.id), "updated");
  assert.deepEqual(await texts(b), ["two"]);
  assert.deepEqual(await b.drafts.changes(), { changed: [], deleted: [] });
  assert.equal(await b.open(d.id), "none");
});

test("opening a note that was changed here and there only marks it", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "start" });
  await a.sync();
  await b.sync();
  await tick();
  await a.drafts.save({ id: d.id, content: "from A" });
  await a.one(d.id);
  await tick();
  await b.drafts.save({ id: d.id, content: "from B" }); // not pushed
  assert.equal(await b.open(d.id), "newer");
  assert.deepEqual(await texts(b), ["from B"]);
  assert.equal(JSON.parse(server.rows.get(d.id).data).content, "from A"); // nothing was sent
});

test("a missing draft changes nothing, and a tombstone for an unchanged draft is reported, not applied", async () => {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "one" });
  await a.sync();
  await b.sync();
  await a.drafts.remove(d.id);
  await a.sync();
  assert.equal(await b.open(d.id), "deleted"); // nothing was changed here: the person decides
  assert.deepEqual(await texts(b), ["one"]); // and nothing was removed

  const local = await b.drafts.save({ content: "never synced" });
  assert.equal(await b.open(local.id), "none"); // 404: absence is not deletion
  assert.ok((await texts(b)).includes("never synced"));
});

test("a draft the server rejects fails alone with its reason, and the others in the run still go", async () => {
  const server = fakeServer();
  const a = device(server);
  const big = await a.drafts.save({ content: "too big" });
  const fine = await a.drafts.save({ content: "fine" });
  const refused = [];
  const fetchFn = async (url, init) =>
    init?.method === "PUT" && url.includes(big.id)
      ? { status: 413, ok: false, json: async () => ({ title: "Too Large" }) }
      : server.fetchFn(url, init);
  const engine = createSyncer({ device: DEVICE, drafts: a.drafts, fetchFn, onRejected: (id, why) => refused.push([id, why]) });
  assert.deepEqual(await engine.all(), sum({ uploaded: 1, failed: 1 }));
  assert.deepEqual(refused, [[big.id, "it is too large"]]);
  assert.ok(server.rows.has(fine.id));
  assert.equal(server.rows.has(big.id), false);
  assert.equal((await a.drafts.get(big.id)).content, "too big", "the text stays here");
});

test("a conflict reports the copy it kept, from Sync all and from a save alike", async () => {
  for (const how of ["all", "one"]) {
    const server = fakeServer();
    const a = device(server);
    const b = device(server);
    const d = await a.drafts.save({ content: "start" });
    await a.sync();
    await b.sync();
    await tick();
    await a.drafts.save({ id: d.id, content: "from A" });
    await a.one(d.id);
    await tick();
    await b.drafts.save({ id: d.id, content: "from B" });
    if (how === "all") await b.sync();
    else await b.one(d.id);
    assert.equal(b.copies.length, 1, how);
    assert.match(b.copies[0].content, /^Conflicted copy .*: from A$/);
    assert.ok((await b.drafts.allIds()).includes(b.copies[0].id));
  }
});

// Deleted on another device while it is open here.
async function deletedElsewhere() {
  const server = fakeServer();
  const a = device(server);
  const b = device(server);
  const d = await a.drafts.save({ content: "doomed" });
  await a.sync();
  await b.sync();
  await a.drafts.remove(d.id);
  await a.sync(); // the tombstone is on the server
  return { server, a, b, id: d.id };
}

test("Sync all leaves the open draft that was deleted elsewhere alone, and says so", async () => {
  const { b, id } = await deletedElsewhere();
  assert.deepEqual(await b.sync(new Set([id])), sum({ skipped: 1 }));
  assert.deepEqual(b.gone, [id]);
  assert.deepEqual(await texts(b), ["doomed"]);
});

test("a tombstone for a draft changed here is not reported: the edit survives", async () => {
  const { b, id } = await deletedElsewhere();
  await tick();
  await b.drafts.save({ id, content: "edited" });
  assert.equal(await b.open(id), "none");
  assert.equal(await b.one(id), "uploaded"); // revives it on the server
});

test("Remove: the draft goes, and is handed back for Undo", async () => {
  const { b, id } = await deletedElsewhere();
  const removed = await b.removeLocal(id);
  assert.equal(removed.content, "doomed");
  assert.deepEqual(await b.drafts.allIds(), []);
  assert.deepEqual(await b.sync(), none);
  assert.equal(await b.removeLocal(id), null); // nothing left to remove
});

test("Keep: the draft stays and is uploaded on top of the tombstone, and the other device gets it back", async () => {
  const { server, a, b, id } = await deletedElsewhere();
  assert.equal(await b.keep(id), "uploaded");
  assert.equal(server.rows.get(id).deleted, false);
  assert.equal(JSON.parse(server.rows.get(id).data).content, "doomed");
  assert.deepEqual(await b.sync(), none);
  assert.deepEqual(await a.sync(), sum({ downloaded: 1 }));
  assert.deepEqual(await texts(a), ["doomed"]);
});

test("Undo after Remove: saving the draft again uploads it, as an edit survives a delete", async () => {
  const { server, b, id } = await deletedElsewhere();
  const removed = await b.removeLocal(id);
  await b.drafts.save({ id, createdAt: removed.createdAt, format: removed.format, content: removed.content });
  assert.equal(await b.one(id), "uploaded");
  assert.equal(server.rows.get(id).deleted, false);
});

test("a delete is pushed by one(id), the way the end of the Undo window does it", async () => {
  const server = fakeServer();
  const a = device(server);
  const d = await a.drafts.save({ content: "bye" });
  await a.one(d.id);
  await a.drafts.remove(d.id);
  server.calls.length = 0;
  assert.equal(await a.one(d.id), "uploaded");
  assert.deepEqual(server.calls, [`PUT /docs/${d.id}`]);
  assert.equal(server.rows.get(d.id).deleted, true);
  // a draft the server never had costs nothing
  const never = await a.drafts.save({ content: "never synced" });
  await a.drafts.remove(never.id);
  server.calls.length = 0;
  assert.equal(await a.one(never.id), "");
  assert.deepEqual(server.calls, []);
});
