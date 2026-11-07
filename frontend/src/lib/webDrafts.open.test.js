import assert from "node:assert/strict";
import test from "node:test";
import { openDB } from "idb";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { DB_NAME, DB_VERSION, openDatabase } from "./webDrafts.ts";

test.beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

test("opens at the current version", async () => {
  const db = await openDatabase();
  assert.equal(db.version, DB_VERSION);
  db.close();
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
  };
  await assert.rejects(openDatabase(), { name: "QuotaExceededError" });
  assert.equal(opens, 1);
});
