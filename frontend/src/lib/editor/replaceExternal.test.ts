import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { autoField, replaceExternal } from "./autocorrect.ts";
import type { EditorView } from "@codemirror/view";

// A stand-in for the editor view: just a state and a dispatch.
function fake(doc, anchor) {
  const view = {
    state: EditorState.create({ doc, selection: { anchor }, extensions: [autoField] }),
    dispatch(spec) {
      this.state = this.state.update(spec).state;
    },
  };
  return view as unknown as EditorView;
}

test("text applied from a file changes only what differs, keeps the caret, and is not treated as typed", () => {
  const view = fake("one\ntwo\nthree\n", 2);
  replaceExternal(view, "one\nTWO and more\nthree\n");
  assert.equal(view.state.doc.toString(), "one\nTWO and more\nthree\n");
  assert.equal(view.state.selection.main.head, 2, "the caret before the change stays put");
  assert.deepEqual(view.state.field(autoField).touched, [], "autocorrect never rewrites it");
});

test("a caret after the changed part moves with the text", () => {
  const view = fake("abc\ndef\n", 8); // at the end
  replaceExternal(view, "abc\nXXXXdef\n");
  assert.equal(view.state.selection.main.head, 12);
});

test("identical text changes nothing, and typing still counts as typed", () => {
  const view = fake("same", 0);
  replaceExternal(view, "same");
  assert.equal(view.state.doc.toString(), "same");
  view.dispatch({ changes: { from: 4, insert: "!" } });
  assert.deepEqual(view.state.field(autoField).touched, [[4, 5]]);
});

test("a whole new text replaces everything", () => {
  const view = fake("old", 1);
  replaceExternal(view, "brand new");
  assert.equal(view.state.doc.toString(), "brand new");
});
