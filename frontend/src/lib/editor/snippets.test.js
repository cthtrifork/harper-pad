import assert from "node:assert/strict";
import test from "node:test";
import { EditorState } from "@codemirror/state";
import { codeSnippet } from "./snippets.js";

// Type `text` at the end of `doc`, one character at a time, as the keyboard does.
function type(doc, text, event = "input.type") {
  let state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [codeSnippet] });
  for (const ch of text) {
    const at = state.selection.main.head;
    state = state.update({ changes: { from: at, insert: ch }, selection: { anchor: at + 1 }, userEvent: event }).state;
  }
  return state;
}

test("<code> becomes a fenced block with the placeholder selected", () => {
  const s = type("", "<code>");
  assert.equal(s.doc.toString(), "```\nWrite code here\n```");
  const { from, to } = s.selection.main;
  assert.equal(s.sliceDoc(from, to), "Write code here");
});

test("after text on the same line it stays as typed", () => {
  assert.equal(type("Try this: ", "<code>").doc.toString(), "Try this: <code>");
});

test("with text after it on the line it stays as typed", () => {
  const start = EditorState.create({ doc: " tail", extensions: [codeSnippet] });
  const s = start.update({ changes: { from: 0, insert: "<code>" }, userEvent: "input.type" }).state;
  assert.equal(s.doc.toString(), "<code> tail");
});

test("on a line of its own, nothing extra is added", () => {
  assert.equal(type("Intro\n", "<code>").doc.toString(), "Intro\n```\nWrite code here\n```");
});

test("pasted <code> and other tags are left alone", () => {
  assert.equal(type("", "<code>", "input.paste").doc.toString(), "<code>");
  assert.equal(type("", "<codex>").doc.toString(), "<codex>");
  assert.equal(type("", "<b>").doc.toString(), "<b>");
});
