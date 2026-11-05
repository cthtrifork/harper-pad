// Runs the cases in internal/store/testdata/validate.json through the web build's `save`. The Go side runs the same file
// (TestSaveValidationFixtures in internal/store/validate_test.go), so both builds accept and refuse the same drafts, with the same message.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { createWebDrafts, openDatabase } from "./webDrafts.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../internal/store/testdata/validate.json", import.meta.url), "utf8"));

test("there are fixtures", () => {
  assert.ok(fixtures.length > 0);
});

for (const f of fixtures) {
  test(f.name, async () => {
    globalThis.indexedDB = new IDBFactory();
    const drafts = createWebDrafts(openDatabase);
    const input = { id: f.id, format: f.format, content: "a".repeat(f.contentBytes) };
    if (f.error) await assert.rejects(drafts.save(input), (err) => err.message.includes(f.error));
    else await drafts.save(input);
  });
}
