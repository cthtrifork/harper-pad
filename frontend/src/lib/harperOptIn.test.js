import assert from "node:assert/strict";
import { test } from "node:test";
import { loadOptIn, saveOptIn } from "./harperOptIn.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test("Harper is off until the person turns it on, and then stays on", () => {
  const s = memory();
  assert.equal(loadOptIn(s), false);
  saveOptIn(true, s);
  assert.equal(loadOptIn(s), true);
  saveOptIn(false, s);
  assert.equal(loadOptIn(s), false);
});

test("blocked storage means off and never throws", () => {
  const blocked = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("blocked");
    },
  };
  assert.equal(loadOptIn(blocked), false);
  assert.doesNotThrow(() => saveOptIn(true, blocked));
});
