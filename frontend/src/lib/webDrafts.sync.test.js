import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "./contentHash.js";
import { openFake } from "./testIdb.js";
import { createWebDrafts, upgrade } from "./webDrafts.js";

function setup() {
  const fake = openFake();
  upgrade(fake.db);
  return { ...fake, drafts: createWebDrafts(fake.open) };
}

const sync = async (drafts, d, version = 1) =>
  drafts.markSynced(d.id, { hash: await contentHash(d.format, d.content), updatedAt: d.updatedAt, version });

test("upgrade adds the sync store and keeps the others", () => {
  const { stores } = setup();
  assert.deepEqual([...stores.keys()].sort(), ["drafts", "kv", "summaries", "sync"]);
});

test("nothing is pending with sync off, and a delete leaves no pending delete", async () => {
  const { drafts } = setup();
  const a = await drafts.save({ content: "a" });
  await drafts.remove(a.id);
  assert.deepEqual(await drafts.changes(), { changed: [], deleted: [] });
});

test("changes follow the text and the format", async () => {
  const { drafts } = setup();
  const a = await drafts.save({ content: "one" });
  const b = await drafts.save({ content: "two" });
  assert.deepEqual((await drafts.changes()).changed, [a.id, b.id].sort());
  await sync(drafts, a);
  await sync(drafts, b);
  assert.deepEqual(await drafts.changes(), { changed: [], deleted: [] });
  await drafts.save({ id: a.id, content: "one" }); // same text, new time: not a change
  assert.deepEqual((await drafts.changes()).changed, []);
  await drafts.save({ id: a.id, content: "one more" });
  await drafts.save({ id: b.id, content: "two", format: "text" });
  assert.deepEqual((await drafts.changes()).changed, [a.id, b.id].sort());
});

test("a delete is pending until the server accepts it, and undo cancels it", async () => {
  const { drafts } = setup();
  const a = await drafts.save({ content: "one" });
  await sync(drafts, a, 3);
  await drafts.remove(a.id);
  assert.deepEqual((await drafts.changes()).deleted, [a.id]);
  await drafts.save({ id: a.id, content: "one", createdAt: a.createdAt });
  assert.deepEqual(await drafts.changes(), { changed: [], deleted: [] });
  await drafts.remove(a.id);
  await drafts.markSynced(a.id, { updatedAt: 9, deleted: true, version: 4 });
  assert.deepEqual((await drafts.changes()).deleted, []);
  assert.equal((await drafts.syncState(a.id)).version, 4);
  assert.equal(await drafts.syncState("0123456789abcdef0123456789abcdef"), null);
});

test("applyRemote keeps the server's times and the file link, and is not a change", async () => {
  const { drafts } = setup();
  const a = await drafts.save({ content: "local" });
  await drafts.setFilePath(a.id, "note.md");
  const got = await drafts.applyRemote({ id: a.id, format: "markdown", content: "from the server", createdAt: 1000, updatedAt: 2000 }, 5);
  assert.deepEqual([got.createdAt, got.updatedAt, got.filePath, got.content], [1000, 2000, "note.md", "from the server"]);
  assert.deepEqual(await drafts.changes(), { changed: [], deleted: [] });
  const st = await drafts.syncState(a.id);
  assert.deepEqual([st.version, st.updatedAt, st.hash], [5, 2000, await contentHash("markdown", "from the server")]);
  assert.equal((await drafts.get(a.id)).content, "from the server");
});

test("applyRemote checks what save checks", async () => {
  const { drafts, stores } = setup();
  const id = "0123456789abcdef0123456789abcdef";
  const ok = { id, content: "x", createdAt: 1, updatedAt: 1 };
  for (const bad of [
    { format: "html" },
    { id: "nope" },
    { createdAt: 0 },
    { updatedAt: undefined },
    { content: "x".repeat((5 << 20) + 1) },
  ]) {
    await assert.rejects(drafts.applyRemote({ ...ok, ...bad }, 1), undefined, JSON.stringify(Object.keys(bad)));
  }
  assert.equal(stores.get("drafts").size, 0, "a rejected draft was stored");
});

test("applyRemoteDelete removes the draft and records the server's tombstone", async () => {
  const { drafts } = setup();
  const a = await drafts.save({ content: "one" });
  await sync(drafts, a);
  await drafts.applyRemoteDelete(a.id, 2, 500);
  await assert.rejects(drafts.get(a.id));
  assert.deepEqual(await drafts.changes(), { changed: [], deleted: [] });
  await drafts.applyRemoteDelete("0123456789abcdef0123456789abcdef", 1, 1); // not here: no error
});

// A build from before sync (version 2) does not know the sync store. What it does to a draft must still be seen.
test("an older build's save and delete are seen by the newer one", async () => {
  const { drafts, stores } = setup();
  const a = await drafts.save({ content: "one" });
  const b = await drafts.save({ content: "two" });
  await sync(drafts, a);
  await sync(drafts, b);
  // What the older build does, by hand: it rewrites the draft record whole and deletes without a trace.
  stores.get("drafts").set(a.id, { ...a, content: "edited by the old build", updatedAt: a.updatedAt + 1 });
  stores.get("drafts").delete(b.id);
  stores.get("summaries").delete(b.id);
  assert.deepEqual(await drafts.changes(), { changed: [a.id], deleted: [b.id] });
});
