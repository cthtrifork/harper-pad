// Runs the cases in internal/store/testdata/contenthash.json, which the Go tests run too, so both sides hash a draft the same way.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { contentHash } from "./contentHash.js";

const fixtures = JSON.parse(readFileSync(new URL("../../../internal/store/testdata/contenthash.json", import.meta.url), "utf8"));

for (const { format, content, hash } of fixtures) {
  test(`hash of ${JSON.stringify(content).slice(0, 30)} (${format})`, async () => {
    assert.equal(await contentHash(format, content), hash);
  });
}
