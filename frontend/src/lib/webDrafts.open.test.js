import assert from "node:assert/strict";
import test from "node:test";
import { DB_NAME, DB_VERSION, openDatabase } from "./webDrafts.js";

// A stand-in for IDBFactory: `stored` is the version of the database that already exists (0: none). Like the browser, opening a lower
// version than the stored one fails with a VersionError; opening without a version opens whatever is there.
function fakeIdb(stored) {
  const calls = [];
  const idb = {
    calls,
    open(name, version) {
      calls.push([name, version]);
      const req = { result: { name, version: version ?? stored }, error: null };
      queueMicrotask(() => {
        if (version !== undefined && version < stored) {
          req.error = { name: "VersionError" };
          req.onerror?.();
        } else {
          if (version !== undefined && version > stored) req.onupgradeneeded?.();
          req.onsuccess?.();
        }
      });
      return req;
    },
  };
  return idb;
}

test("opens at the current version", async () => {
  const idb = fakeIdb(DB_VERSION);
  const db = await openDatabase(idb);
  assert.equal(db.version, DB_VERSION);
  assert.deepEqual(idb.calls, [[DB_NAME, DB_VERSION]]);
});

test("opens a database that a newer build has migrated, as it is", async () => {
  const idb = fakeIdb(DB_VERSION + 1);
  const db = await openDatabase(idb);
  assert.equal(db.version, DB_VERSION + 1);
  assert.deepEqual(idb.calls, [
    [DB_NAME, DB_VERSION],
    [DB_NAME, undefined],
  ]);
});

test("other errors are not retried", async () => {
  const idb = {
    open() {
      const req = { error: { name: "QuotaExceededError" } };
      queueMicrotask(() => req.onerror());
      return req;
    },
  };
  await assert.rejects(openDatabase(idb), { name: "QuotaExceededError" });
});
