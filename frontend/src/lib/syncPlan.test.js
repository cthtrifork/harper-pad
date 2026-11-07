// One test per row of the decision table in docs/sync.md ("Conflicts"), plus the edges the table implies.
import assert from "node:assert/strict";
import test from "node:test";
import { decide, settle } from "./syncPlan.ts";

const live = (updatedAt) => ({ updatedAt, deleted: false });
const gone = (updatedAt) => ({ updatedAt, deleted: true });
const same = { changed: false };
const edited = { changed: true };

const rows = [
  ["unchanged here, unchanged there", { local: same, synced: live(1), server: live(1) }, "none"],
  ["unchanged here, newer there: plain update", { local: same, synced: live(1), server: live(2) }, "download"],
  ["changed here, unchanged there: plain update", { local: edited, synced: live(1), server: live(1) }, "upload"],
  ["changed on both sides: settle decides", { local: edited, synced: live(1), server: live(2) }, "resolve"],
  ["changed here, deleted there: the edit survives", { local: edited, synced: live(1), server: gone(2) }, "upload"],
  ["unchanged here, deleted there", { local: same, synced: live(1), server: gone(2) }, "remove-local"],
  ["deleted here, unchanged there", { local: null, synced: live(1), server: live(1) }, "upload-tombstone"],
  ["deleted here, edited elsewhere: the edit survives", { local: null, synced: live(1), server: live(2) }, "download"],
  ["has it, the server has no copy: absence is not deletion", { local: edited, synced: null, server: null }, "upload"],
  ["has it, the server lost it after a sync: rebuild it", { local: same, synced: live(1), server: null }, "upload"],
  ["does not have it, the server does, no pending delete", { local: null, synced: null, server: live(1) }, "download"],

  // Edges.
  ["first sync, same id on both sides: compare the text", { local: edited, synced: null, server: live(1) }, "resolve"],
  ["first sync, only the server has a tombstone", { local: null, synced: null, server: gone(1) }, "none"],
  ["deleted on both sides", { local: null, synced: live(1), server: gone(2) }, "none"],
  ["removed here after a tombstone, still a tombstone", { local: null, synced: gone(2), server: gone(2) }, "none"],
  ["removed here after a tombstone, revived elsewhere", { local: null, synced: gone(2), server: live(3) }, "download"],
  ["nothing anywhere", { local: null, synced: null, server: null }, "none"],
  ["deleted here, the server has nothing", { local: null, synced: live(1), server: null }, "none"],
  ["a state is the pair: same time, now deleted", { local: same, synced: live(1), server: gone(1) }, "remove-local"],
];

for (const [name, input, want] of rows) {
  test(name, () => assert.equal(decide(input), want));
}

test("settle: the same hash adopts the server's state, a different one is a conflict", () => {
  assert.equal(settle("abc", "abc"), "adopt");
  assert.equal(settle("abc", "abd"), "conflict");
});
