// Runs the cases in internal/app/testdata/filename.json through `fileName`. The Go side runs the same file (TestSuggestName in
// internal/app/files_test.go), so the file name offered on desktop and on the web cannot drift apart.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileName } from "./webFiles.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../internal/app/testdata/filename.json", import.meta.url), "utf8"));

test("there are fixtures", () => {
  assert.ok(fixtures.length > 0);
});

for (const f of fixtures) {
  test(f.name, () => {
    assert.equal(fileName(f.title, f.format), f.want);
  });
}
