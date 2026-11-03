import assert from "node:assert/strict";
import { test } from "node:test";
import { applySize, DEFAULT_SIZE, loadSize, SIZES, saveSize, stepSize } from "./fontSize.js";

const memory = () => {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
};

test("steps go up and down and stop at the ends", () => {
  assert.equal(stepSize(19, 1), 22);
  assert.equal(stepSize(19, -1), 16);
  assert.equal(stepSize(SIZES.at(-1), 1), SIZES.at(-1));
  assert.equal(stepSize(SIZES[0], -1), SIZES[0]);
  assert.equal(stepSize(26, 0), DEFAULT_SIZE);
});

test("an unknown size steps from the default", () => {
  assert.equal(stepSize(20, 1), 22);
});

test("the size is remembered; the default and bad values are not stored", () => {
  const s = memory();
  assert.equal(loadSize("editor", s), DEFAULT_SIZE);
  saveSize("editor", 22, s);
  assert.equal(loadSize("editor", s), 22);
  assert.equal(loadSize("preview", s), DEFAULT_SIZE); // each has its own
  saveSize("preview", 26, s);
  assert.equal(loadSize("preview", s), 26);
  assert.equal(loadSize("editor", s), 22);
  saveSize("editor", DEFAULT_SIZE, s);
  assert.equal(s.getItem("harper-pad.editor-size"), null);
  s.setItem("harper-pad.editor-size", "99");
  assert.equal(loadSize("editor", s), DEFAULT_SIZE);
});

test("blocked storage falls back to the default", () => {
  const blocked = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
    removeItem() {
      throw new Error("blocked");
    },
  };
  assert.equal(loadSize("editor", blocked), DEFAULT_SIZE);
  assert.doesNotThrow(() => saveSize("editor", 22, blocked));
});

test("applySize sets the property on the page", () => {
  const set = [];
  applySize("preview", 26, { style: { setProperty: (k, v) => set.push([k, v]) } });
  assert.deepEqual(set, [
    ["--preview-size", "26px"],
    ["--preview-scale", String(26 / 19)],
  ]);
});
