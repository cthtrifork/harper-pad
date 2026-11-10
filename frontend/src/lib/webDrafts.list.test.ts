import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { createWebDrafts, openDatabase } from "./webDrafts.ts";

async function withDrafts(...texts) {
  globalThis.indexedDB = new IDBFactory();
  const drafts = createWebDrafts(openDatabase);
  const saved = [];
  for (const content of texts) {
    saved.push(await drafts.save({ content }));
    await new Promise((resolve) => setTimeout(resolve, 2)); // distinct update times
  }
  return { drafts, saved };
}

test("list is newest first and pages with limit and offset", async () => {
  const { drafts, saved } = await withDrafts("one", "two", "three");
  const all = await drafts.list(50, 0);
  assert.equal(all.total, 3);
  assert.deepEqual(
    all.drafts.map((d) => d.id),
    saved.map((d) => d.id).reverse(),
  );
  const page = await drafts.list(1, 1);
  assert.deepEqual(
    page.drafts.map((d) => d.id),
    [saved[1].id],
  );
});

test("search matches the text ignoring case and keeps the order", async () => {
  const { drafts, saved } = await withDrafts("Apple pie", "banana", "apple tart");
  const found = await drafts.search("APPLE", 50);
  assert.equal(found.total, 2);
  assert.deepEqual(
    found.drafts.map((d) => d.id),
    [saved[2].id, saved[0].id],
  );
});

test("search reads the title of a protected draft, never its ciphertext", async () => {
  const { drafts, saved } = await withDrafts(
    "plain notes about apples",
    'hp-protected:1:{"s":"c2FsdA==","n":"bm9uY2U=","c":"YXBwbGUtY2lwaGVydGV4dA==","t":"Orchard"}',
    'hp-protected:1:{"s":"c2FsdA==","n":"bm9uY2U=","c":"YXBwbGUtY2lwaGVydGV4dA=="}',
  );
  const ids = async (q) => (await drafts.search(q, 50)).drafts.map((d) => d.id);
  assert.deepEqual(await ids("apple"), [saved[0].id]); // not the ciphertext of the other two
  assert.deepEqual(await ids("orchard"), [saved[1].id]);
  assert.deepEqual(await ids("locked"), [saved[2].id]);
  assert.deepEqual(await ids("hp-protected"), []);
  const listed = (await drafts.list()).drafts;
  assert.equal(listed.find((d) => d.id === saved[0].id).protected, false);
  assert.equal(listed.find((d) => d.id === saved[1].id).protected, true);
  assert.equal(listed.find((d) => d.id === saved[1].id).excerpt, "");
});
