import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { generateDeviceKey } from "./dpop.ts";
import { createDeviceStore } from "./syncDevice.ts";
import { createWebDrafts, openDatabase } from "./webDrafts.ts";

const fresh = () => {
  globalThis.indexedDB = new IDBFactory();
  return createDeviceStore(openDatabase);
};

test("a device that never enrolled has no record", async () => {
  assert.equal(await fresh().load(), null);
});

test("the record, with its non-extractable key, comes back as saved", async () => {
  const store = fresh();
  const key = await generateDeviceKey();
  await store.save({ server: "https://sync.example.com", token: "tok", ...key });
  const back = await store.load();
  assert.equal(back.server, "https://sync.example.com");
  assert.equal(back.token, "tok");
  assert.deepEqual(back.publicJwk, key.publicJwk);
  assert.equal(back.privateKey.extractable, false);
});

test("clear forgets the device and leaves the drafts alone", async () => {
  const store = fresh();
  const drafts = createWebDrafts(openDatabase);
  const saved = await drafts.save({ content: "keep me" });
  await store.save({ server: "https://sync.example.com", token: "tok" });
  await store.clear();
  assert.equal(await store.load(), null);
  assert.equal((await drafts.get(saved.id)).content, "keep me");
});
