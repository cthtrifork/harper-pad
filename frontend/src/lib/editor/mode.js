import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { EditorView, highlightActiveLine, lineNumbers } from "@codemirror/view";
import { tags } from "@lezer/highlight";
import { codeSnippet } from "./snippets.js";

// The markdown source view: line numbers, a highlighted current line, and the markup (`#`, `**`, `- [ ]`) dimmed so the words
// stand out. Plain text gets none of it.
const markdownStyle = HighlightStyle.define([
  { tag: [tags.processingInstruction, tags.contentSeparator], color: "var(--mute)" },
  { tag: tags.heading, fontWeight: "600" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.monospace, fontFamily: "var(--font-mono)", fontSize: "0.9em" },
  { tag: [tags.link, tags.url], color: "var(--c-style)" },
]);

// Split shows the source as the design does: a monospace face, 30 px lines, line numbers and the current line.
const sourceTheme = EditorView.theme({
  "&": { fontSize: "calc(var(--editor-size, 19px) * 15 / 19)" },
  ".cm-scroller": { fontFamily: "var(--font-mono)", lineHeight: "30px" },
  ".cm-content": { padding: "20px 0" },
});

const markdownTheme = EditorView.theme({
  ".cm-gutters": {
    backgroundColor: "transparent",
    color: "var(--mute)",
    border: "0",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    marginRight: "14px",
  },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--accent) 7%, transparent)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--text)" },
});

// `mode` is { format: "markdown" | "text", source: boolean }; `source` is the Split view's source pane.
export function modeExtensions({ format, source }) {
  if (format === "text") return [];
  const base = [markdown(), syntaxHighlighting(markdownStyle), codeSnippet];
  return source ? [...base, markdownTheme, sourceTheme, lineNumbers(), highlightActiveLine()] : base;
}
