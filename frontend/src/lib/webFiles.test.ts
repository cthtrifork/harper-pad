// Runs the cases in testdata/filename.json through `fileName`.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileName } from "./webFiles.ts";

const fixtures = JSON.parse(readFileSync(new URL("./testdata/filename.json", import.meta.url), "utf8"));

test("there are fixtures", () => {
  assert.ok(fixtures.length > 0);
});

for (const f of fixtures) {
  test(f.name, () => {
    assert.equal(fileName(f.title, f.format), f.want);
  });
}
