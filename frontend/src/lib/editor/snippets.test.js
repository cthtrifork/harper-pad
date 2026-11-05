import assert from "node:assert/strict";
import test from "node:test";
import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { expandSnippet } from "./snippets.js";

// A state with the caret at `at` (default: the end) in `doc`; returns the document and the selected text after expanding.
function expand(doc, at = doc.length) {
  const state = EditorState.create({ doc, selection: { anchor: at }, extensions: [markdown()] });
  const spec = expandSnippet(state);
  if (!spec) return null;
  const next = state.update(spec).state;
  const { from, to } = next.selection.main;
  return { doc: next.doc.toString(), selected: next.sliceDoc(from, to), caret: from };
}

test("<code> becomes a fenced block with the placeholder selected", () => {
  const r = expand("<code>");
  assert.equal(r.doc, "```\nWrite code here\n```");
  assert.equal(r.selected, "Write code here");
});

test("language snippets put the language in the fence", () => {
  for (const lang of ["sh", "json", "yaml", "toml"]) {
    assert.equal(expand(`<${lang}>`).doc, `\`\`\`${lang}\nWrite code here\n\`\`\``);
  }
});

test("<todo> leaves the caret after the box", () => {
  const r = expand("<todo>");
  assert.equal(r.doc, "- [ ] ");
  assert.equal(r.selected, "");
  assert.equal(r.caret, 6);
});

test("<table> is a table with the first heading selected", () => {
  const r = expand("<table>");
  assert.equal(r.doc, "| Column | Column |\n| --- | --- |\n| Cell | Cell |");
  assert.equal(r.selected, "Column");
  assert.equal(r.caret, 2);
});

test("<link> and <img> select the text to fill in", () => {
  const link = expand("<link>");
  assert.equal(link.doc, "[text](https://)");
  assert.equal(link.selected, "text");
  const img = expand("<img>");
  assert.equal(img.doc, "![alt](https://)");
  assert.equal(img.selected, "alt");
});

test("only the line with the caret changes", () => {
  assert.equal(expand("Intro\n\n<code>\nafter", 13).doc, "Intro\n\n```\nWrite code here\n```\nafter");
});

test("a trigger with other text on its line is left alone", () => {
  assert.equal(expand("Try: <code>"), null);
  assert.equal(expand("<code> tail"), null);
  assert.equal(expand("<code> tail", 6), null); // caret before the tail
  assert.equal(expand("<code>x"), null);
});

test("unknown tags and a range selection are left alone", () => {
  assert.equal(expand("<codex>"), null);
  assert.equal(expand("<b>"), null);
  const state = EditorState.create({ doc: "<code>", selection: { anchor: 0, head: 6 }, extensions: [markdown()] });
  assert.equal(expandSnippet(state), null);
});

test("inside a fenced block it is just text", () => {
  assert.equal(expand("```\n<code>\n```", 9), null);
});

test("spaces around the trigger do not count", () => {
  assert.equal(expand("  <code>").doc, "```\nWrite code here\n```");
  assert.equal(expand("<code>  ").doc, "```\nWrite code here\n```");
});
