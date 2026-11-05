import assert from "node:assert/strict";
import test from "node:test";
import { TEMPLATES, templateText } from "./templates.js";

test("offers an empty draft first, then a todo list and meeting notes", () => {
  assert.deepEqual(
    TEMPLATES.map((t) => t.id),
    ["empty", "todo", "meeting"],
  );
});

test("a todo list starts with an open task, so the drawer shows task progress", () => {
  assert.match(templateText("todo"), /^- \[ \] /m);
});

test("empty and unknown ids give an empty draft", () => {
  assert.equal(templateText("empty"), "");
  assert.equal(templateText("nope"), "");
});

test("meeting notes end on an open action, where the caret lands", () => {
  assert.match(templateText("meeting"), /## Actions\n\n- \[ \] $/);
});
