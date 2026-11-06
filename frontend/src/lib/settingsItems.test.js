import assert from "node:assert/strict";
import test from "node:test";
import { changesFor, itemsData, mergeItems, parseItems, reconcile, sameItems } from "./settingsItems.js";

const live = (at) => ({ at, del: false });
const gone = (at) => ({ at, del: true });

test("reconcile stamps new words and tombstones removed ones, and leaves the rest", () => {
  const before = { Wails: live(1), Old: live(2), Back: gone(3) };
  const after = reconcile(before, ["Wails", "Back", "New"], 10);
  assert.deepEqual(after, { Wails: live(1), Old: gone(10), Back: live(10), New: live(10) });
});

test("merge: the later change per word wins, a tie keeps the word, a missing word is never a removal", () => {
  assert.deepEqual(mergeItems({ a: live(5) }, { a: gone(6) }).a, gone(6)); // removed later elsewhere
  assert.deepEqual(mergeItems({ a: gone(7) }, { a: live(6) }).a, gone(7)); // a stale device still has it: the removal stays
  assert.deepEqual(mergeItems({ a: gone(8) }, { a: live(9) }).a, live(9)); // added again after the removal
  assert.deepEqual(mergeItems({ a: gone(5) }, { a: live(5) }).a, live(5)); // tie
  assert.deepEqual(mergeItems({ a: live(5) }, { a: gone(5) }).a, live(5));
  assert.deepEqual(mergeItems({ a: live(1) }, { b: live(2) }), { a: live(1), b: live(2) }); // union
  assert.deepEqual(mergeItems({ a: live(1) }, {}), { a: live(1) });
});

test("merge is commutative and idempotent", () => {
  const x = { a: live(1), b: gone(4), c: live(2) };
  const y = { a: gone(3), b: live(4), d: live(1) };
  assert.ok(sameItems(mergeItems(x, y), mergeItems(y, x)));
  assert.ok(sameItems(mergeItems(x, x), x));
});

test("changesFor says what the dictionary must add and remove", () => {
  const items = { a: live(1), b: gone(2), c: live(3) };
  assert.deepEqual(changesFor(items, ["b", "z"]), { add: ["a", "c"], remove: ["b"] });
});

test("parseItems keeps well-formed entries and drops the rest; garbage is an empty set", () => {
  const ok = parseItems(itemsData({ Wails: live(1), Gone: gone(2) }));
  assert.deepEqual(ok, { Wails: live(1), Gone: gone(2) });
  const mixed = JSON.stringify({
    v: 1,
    items: { fine: live(1), "two words": live(1), "": live(1), neg: { at: -1, del: false }, nodel: { at: 1 }, nul: null },
  });
  assert.deepEqual(parseItems(mixed), { fine: live(1) });
  assert.deepEqual(parseItems("nope"), {});
  assert.deepEqual(parseItems('{"v":2,"items":{"a":{"at":1,"del":false}}}'), {});
  assert.deepEqual(parseItems(`{"v":1,"items":{"${"a".repeat(65)}":{"at":1,"del":false}}}`), {});
});

test("for the ignore list an item is a decimal hash", () => {
  const data = itemsData({ "18446744073709551615": live(1), abc: live(1), "": live(1) });
  assert.deepEqual(Object.keys(parseItems(data, "ignored")), ["18446744073709551615"]);
  assert.deepEqual(Object.keys(parseItems(itemsData({ Wails: live(1), 12: live(1) }), "words")).sort(), ["12", "Wails"]);
});
