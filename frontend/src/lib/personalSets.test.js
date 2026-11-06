// What the sync wiring does to Harper (App.vue's applyWords and applyIgnoredHashes use these), against a fake linter with Harper's
// semantics: words and ignored hashes can be added, the ignore list can be cleared, a word cannot be removed.
import assert from "node:assert/strict";
import test from "node:test";
import { applyIgnored, exportList, hashesOf, removeIgnored, withoutWords } from "./personalSets.js";

function fakeLinter(words = [], hashes = []) {
  const l = {
    words: new Set(words),
    hashes: new Set(hashes),
    disposed: false,
    exportWords: async () => [...l.words],
    importWords: async (w) => w.forEach((x) => l.words.add(x)),
    exportIgnoredLints: async () => exportList([...l.hashes]),
    importIgnoredLints: async (json) => hashesOf(json).forEach((h) => l.hashes.add(h)),
    clearIgnoredLints: async () => l.hashes.clear(),
    dispose: async () => {
      l.disposed = true;
    },
  };
  return l;
}

test("the ignore list: hashes are read as text, so 64-bit ones are not rounded", () => {
  const h = "18446744073709551615";
  assert.deepEqual(hashesOf(exportList([h, "1"])), [h, "1"]);
  assert.deepEqual(hashesOf(undefined), []);
});

test("applyIgnored imports what another device ignored and clears what it stopped ignoring", async () => {
  const l = fakeLinter([], ["1", "2", "3"]);
  await applyIgnored(l, { add: ["9"], remove: ["2"] });
  assert.deepEqual([...l.hashes].sort(), ["1", "3", "9"]);
  await applyIgnored(l, { add: [], remove: [] });
  assert.deepEqual([...l.hashes].sort(), ["1", "3", "9"]);
  await removeIgnored(l, "1");
  assert.deepEqual([...l.hashes].sort(), ["3", "9"]);
});

test("withoutWords builds a new linter with the words that stay and the same ignore list", async () => {
  const old = fakeLinter(["Keep", "Drop", "Drop2"], ["5"]);
  const next = await withoutWords(old, ["Drop", "Drop2"], async () => fakeLinter());
  assert.deepEqual([...next.words], ["Keep"]);
  assert.deepEqual([...next.hashes], ["5"]);
  assert.equal(old.words.size, 3, "the old linter is the caller's to dispose");
});

test("withoutWords disposes the new linter if filling it fails", async () => {
  const next = fakeLinter();
  next.importWords = async () => {
    throw new Error("boom");
  };
  await assert.rejects(
    withoutWords(fakeLinter(["a", "b"]), ["b"], async () => next),
    /boom/,
  );
  assert.equal(next.disposed, true);
});
