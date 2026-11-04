import assert from "node:assert/strict";
import test from "node:test";
import { PREVIEW, scoped } from "./scope.js";

// Under `node --test` there is no import.meta.env, so the base is "/": production names, unchanged.
test("production keeps the plain storage names", () => {
  assert.equal(PREVIEW, "");
  assert.equal(scoped("harper-pad"), "harper-pad");
});
