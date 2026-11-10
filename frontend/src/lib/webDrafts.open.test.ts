import assert from "node:assert/strict";
import test from "node:test";
import { openDB } from "idb";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { createWebDrafts, DB_NAME, DB_VERSION, openDatabase } from "./webDrafts.ts";

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

test("opens at the current version", async () => {
  const db = await openDatabase();
  assert.equal(db.version, DB_VERSION);
  db.close();
});

test("upgrading explicit protection metadata preserves drafts and removes the old excerpt marker", async () => {
  const protectedDraft = {
    id: "a".repeat(32),
    content: 'hp-protected:1:{"s":"salt","n":"nonce","c":"ciphertext","t":"Private notes"}',
    format: "markdown",
    createdAt: 1,
    updatedAt: 2,
  };
  const plain = { ...protectedDraft, id: "b".repeat(32), content: "Title\nhp-protected" };
  const old = await openDB(DB_NAME, 3, {
    upgrade(db) {
      db.createObjectStore("drafts", { keyPath: "id" });
      db.createObjectStore("summaries", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
    },
  });
  for (const draft of [protectedDraft, plain]) {
    await old.put("drafts", draft);
    await old.put("summaries", { id: draft.id, updatedAt: draft.updatedAt, excerpt: "hp-protected" });
  }
  old.close();
  const db = await openDatabase();
  try {
    assert.deepEqual(await db.get("drafts", protectedDraft.id), protectedDraft);
    const stored = await db.get("summaries", protectedDraft.id);
    assert.equal(stored.protected, true);
    assert.equal(stored.title, "Private notes");
    assert.equal(stored.excerpt, "");
    const ordinary = await db.get("summaries", plain.id);
    assert.equal(ordinary.protected, false);
    assert.equal(ordinary.excerpt, "hp-protected");
  } finally {
    db.close();
  }
  const drafts = createWebDrafts(openDatabase);
  assert.equal((await drafts.search("private")).drafts[0].protected, true);
});

test("opens a database that a newer build has migrated, as it is", async () => {
  (await openDB(DB_NAME, DB_VERSION + 1)).close();
  const db = await openDatabase();
  assert.equal(db.version, DB_VERSION + 1);
  db.close();
});

test("other errors are not retried", async () => {
  let opens = 0;
  globalThis.indexedDB = {
    open() {
      opens++;
      throw Object.assign(new Error("full"), { name: "QuotaExceededError" });
    },
  } as unknown as IDBFactory;
  await assert.rejects(openDatabase(), { name: "QuotaExceededError" });
  assert.equal(opens, 1);
});
