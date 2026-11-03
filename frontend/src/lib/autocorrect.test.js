import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addRange,
  categoryOf,
  DEFAULT_PREFS,
  isFinished,
  isMarkdownSpacing,
  isSafe,
  loadPrefs,
  nonOverlapping,
  savePrefs,
  touches,
} from "./autocorrect.js";

const finding = (kind, fixes) => ({ kind, fixes: fixes.map((text) => ({ kind: "replace", text })) });

test("only a finding with exactly one suggestion is safe", () => {
  assert.equal(categoryOf(finding("Typo", ["the"])), "typos");
  assert.equal(categoryOf(finding("Spelling", ["received"])), "typos");
  assert.equal(categoryOf(finding("Spelling", ["received", "relieved", "receive"])), null);
  assert.equal(categoryOf(finding("Capitalization", ["I"])), "caps");
  assert.equal(categoryOf(finding("Repetition", ["the"])), "reps");
  assert.equal(categoryOf(finding("Formatting", [" "])), "spaces");
  assert.equal(categoryOf(finding("Formatting", ["x"])), null);
});

test("grammar, style and insert-only fixes are never auto-fixed", () => {
  assert.equal(categoryOf(finding("Grammar", ["an"])), null);
  assert.equal(categoryOf(finding("Miscellaneous", ["an"])), null);
  assert.equal(categoryOf({ kind: "Spelling", fixes: [{ kind: "insert", text: "s" }] }), null);
  assert.equal(categoryOf({ kind: "Spelling", fixes: [] }), null);
});

test("a category the user switched off is not safe", () => {
  const prefs = { ...DEFAULT_PREFS, caps: false };
  assert.equal(isSafe(finding("Capitalization", ["I"]), prefs), false);
  assert.equal(isSafe(finding("Typo", ["the"]), prefs), true);
});

test("a finding is finished only after the space or punctuation that ends it has been typed", () => {
  const text = "I saw teh cat";
  assert.equal(isFinished(text, 9, 10), true); // "teh" then a typed space, caret after it
  assert.equal(isFinished(text, 9, 9), false); // the caret is still at the end of the word
  assert.equal(isFinished("I saw teh", 9, 9), false); // nothing after it yet
  assert.equal(isFinished("I saw tehx", 9, 10), false); // the word goes on
  assert.equal(isFinished("it's teh, ok", 8, 9), true); // punctuation ends it
  assert.equal(isFinished("a well-known", 6, 7), false); // a hyphen continues a word
});

test("typed ranges merge when they overlap or touch", () => {
  let r = addRange([], 10, 12);
  r = addRange(r, 0, 3);
  assert.deepEqual(r, [
    [0, 3],
    [10, 12],
  ]);
  r = addRange(r, 3, 10);
  assert.deepEqual(r, [[0, 12]]);
  assert.equal(touches(r, 12, 14), true);
  assert.equal(touches(r, 13, 14), false);
});

test("findings that overlap are applied only once", () => {
  const items = [
    { from: 10, to: 15 },
    { from: 0, to: 4 },
    { from: 12, to: 14 },
  ];
  assert.deepEqual(nonOverlapping(items), [
    { from: 0, to: 4 },
    { from: 10, to: 15 },
  ]);
});

test("the choices survive a round trip, and bad or missing storage gives the defaults", () => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  assert.deepEqual(loadPrefs(storage), DEFAULT_PREFS);
  savePrefs({ on: true, typos: true, caps: false, reps: true, spaces: true }, storage);
  assert.deepEqual(loadPrefs(storage), { on: true, typos: true, caps: false, reps: true, spaces: true });
  data.set("harper-pad.autocorrect", "{not json");
  assert.deepEqual(loadPrefs(storage), DEFAULT_PREFS);
  const broken = {
    getItem() {
      throw new Error("blocked");
    },
    setItem() {
      throw new Error("blocked");
    },
  };
  assert.deepEqual(loadPrefs(broken), DEFAULT_PREFS);
  assert.doesNotThrow(() => savePrefs(DEFAULT_PREFS, broken));
});

test("spaces that are Markdown (line indent, hard line break) are not extra", () => {
  const text = "one  two\n  indented\nbreak  \nnext";
  assert.equal(isMarkdownSpacing(text, 3, 5), false); // between words
  assert.equal(isMarkdownSpacing(text, 9, 11), true); // start of a line
  assert.equal(isMarkdownSpacing(text, 0, 2), true); // start of the text
  assert.equal(isMarkdownSpacing(text, 25, 27), true); // end of a line: hard break
});
