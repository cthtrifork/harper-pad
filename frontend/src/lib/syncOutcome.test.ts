import assert from "node:assert/strict";
import test from "node:test";
import { failureText, LOCAL_TEXT, OFFLINE_TEXT } from "./syncOutcome.ts";

test("offline, signed out and unfinished each say what happened and that the drafts are safe", () => {
  assert.equal(failureText("offline"), OFFLINE_TEXT);
  assert.match(failureText("signin"), /^Signed out/);
  assert.equal(failureText("pending", "Sync did not finish. Try again."), "Sync did not finish. Try again.");
  assert.equal(failureText("pending"), "Sync did not finish. Try again");
});

test("local-only has its own text, and a good sync has no failure text", () => {
  assert.match(LOCAL_TEXT, /^Sync is off/);
  assert.equal(failureText("synced"), "");
  assert.equal(failureText("off"), "");
});
