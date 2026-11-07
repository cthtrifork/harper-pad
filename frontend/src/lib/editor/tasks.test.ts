import assert from "node:assert/strict";
import test from "node:test";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { findTasks, parseTask, toggleChange } from "./tasks.ts";

const state = (doc) => EditorState.create({ doc, extensions: [markdown()] });

test("parseTask reads bullets and numbers, ticked or not", () => {
  assert.deepEqual(parseTask("- [ ] a"), { from: 2, to: 5, checked: false });
  assert.deepEqual(parseTask("* [x] a"), { from: 2, to: 5, checked: true });
  assert.deepEqual(parseTask("  + [X] a"), { from: 4, to: 7, checked: true });
  assert.deepEqual(parseTask("12. [ ]"), { from: 4, to: 7, checked: false });
  assert.deepEqual(parseTask("1) [x] done"), { from: 3, to: 6, checked: true });
});

test("parseTask rejects things that are not tasks", () => {
  for (const s of ["[ ] a", "- [] a", "- [y] a", "- [x]a", "- [ ]a", "-[ ] a", "text - [ ] a", "- [link](u)", ""]) {
    assert.equal(parseTask(s), null, s);
  }
});

test("toggleChange flips only the character inside the brackets", () => {
  for (const [text, want] of [
    ["- [ ] a", "- [x] a"],
    ["- [x] a", "- [ ] a"],
    ["  1. [X] a", "  1. [ ] a"],
  ]) {
    const t = parseTask(text);
    const c = toggleChange(t.from, t.checked);
    assert.equal(text.slice(0, c.from) + c.insert + text.slice(c.to), want);
  }
});

test("findTasks gives document offsets and skips fenced and indented code", () => {
  const doc = "Intro\n\n    - [ ] indented code\n\n- [ ] one\n\n```\n- [ ] in fence\n```\n\n- [x] two\n";
  const found = findTasks(state(doc));
  assert.deepEqual(
    found.map((t) => [t.from, t.checked]),
    [
      [doc.indexOf("[ ] one"), false],
      [doc.indexOf("[x] two"), true],
    ],
  );
  for (const t of found) assert.equal(doc.slice(t.from, t.to), t.checked ? "[x]" : "[ ]");
});

test("findTasks finds nested tasks and respects the ranges asked for", () => {
  const doc = "- [ ] a\n  - [x] b\n- [ ] c\n";
  assert.equal(findTasks(state(doc)).length, 3);
  assert.equal(findTasks(state(doc), [{ from: 8, to: 17 }]).length, 1);
});

test("a toggle is an ordinary change that undo history can see", () => {
  const s = state("- [ ] a");
  const t = findTasks(s)[0];
  const next = s.update({ changes: toggleChange(t.from, t.checked) }).state;
  assert.equal(next.doc.toString(), "- [x] a");
});
