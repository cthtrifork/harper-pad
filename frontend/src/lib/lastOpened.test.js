import assert from "node:assert/strict";
import { test } from "node:test";
import { loadLastOpened, saveLastOpened, withLastOpened } from "./lastOpened.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};
const A = "a".repeat(32);
const B = "b".repeat(32);

test("an id round-trips and anything else clears it", () => {
  const s = memory();
  assert.equal(loadLastOpened(s), "");
  saveLastOpened(A, s);
  assert.equal(loadLastOpened(s), A);
  saveLastOpened("", s);
  assert.equal(loadLastOpened(s), "");
});

test("blocked storage gives no memory and does not throw", () => {
  const s = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
    removeItem: () => {},
  };
  assert.equal(loadLastOpened(s), "");
  saveLastOpened(A, s);
});

test("start-up opens the last opened draft instead of the newest", async () => {
  const s = memory();
  saveLastOpened(B, s);
  const start = { open: { id: A }, total: 2 };
  const out = await withLastOpened(start, async (id) => ({ id, content: "x" }), s);
  assert.equal(out.open.id, B);
  assert.equal(out.total, 2);
});

test("a missing last opened draft falls back to the newest", async () => {
  const s = memory();
  saveLastOpened(B, s);
  const start = { open: { id: A } };
  assert.equal(await withLastOpened(start, async () => Promise.reject(new Error("draft not found")), s), start);
});

test("no drafts, no memory, or the same draft leave the answer alone", async () => {
  const s = memory();
  const fail = async () => assert.fail("must not read");
  const none = { open: null };
  assert.equal(await withLastOpened(none, fail, s), none);
  const start = { open: { id: A } };
  assert.equal(await withLastOpened(start, fail, s), start);
  saveLastOpened(A, s);
  assert.equal(await withLastOpened(start, fail, s), start);
});
