// The client's limits for the dictionary and ignore list must be the server's (backend/internal/syncapi/settings.go).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { LIMITS } from "./settingsItems.js";

test("the sync limits match the server's", () => {
  const go = readFileSync(new URL("../../../backend/internal/syncapi/settings.go", import.meta.url), "utf8");
  const num = (name) => Number(new RegExp(`\\b${name}\\s*=\\s*(\\d+)`).exec(go)?.[1]);
  assert.equal(num("maxWords"), LIMITS.words);
  assert.equal(num("maxIgnored"), LIMITS.ignored);
  assert.equal(num("maxWordRunes"), LIMITS.wordChars);
});
