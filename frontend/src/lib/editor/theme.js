import { EditorView } from "@codemirror/view";

const underline = (color) => ({
  backgroundImage: "none",
  textDecoration: `underline wavy ${color}`,
  textDecorationThickness: "1.5px",
  textUnderlineOffset: "5px",
});

export const theme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "var(--editor-size, 19px)" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-doc)", lineHeight: "1.75" },
  ".cm-content": { caretColor: "var(--accent)", padding: "0" },
  // drawSelection paints the caret as a border (and dropCursor the drop point), so the colour is set here, not with caret-color.
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  ".cm-line": { padding: "0" },
  // Longer than CodeMirror's own focused rule (a lavender), which would otherwise win now that drawSelection paints the selection.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent) !important",
  },
  ".cm-lintRange-error": underline("var(--c-spelling)"),
  ".cm-lintRange-warning": underline("var(--c-grammar)"),
  ".cm-lintRange-info": underline("var(--c-style)"),
  ".cm-lintRange-active": { backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)", borderRadius: "3px" },
  ".cm-tooltip": {
    backgroundColor: "var(--raised)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: "8px",
    boxShadow: "var(--shadow-pop)",
    fontFamily: "var(--font-ui)",
  },
  // max-content: with the absolute positioning CodeMirror uses on iOS, a shrink-to-fit width depends on `left`, so each measure
  // narrowed the popup, re-wrapped it and moved it again until it settled. A width that ignores `left` is stable at once.
  ".cm-tooltip-lint": { width: "max-content", maxWidth: "min(340px, calc(100vw - 16px))", padding: "4px" },
  ".cm-diagnostic": { padding: "10px 12px", borderLeft: "0", fontSize: "13px", lineHeight: "1.45" },
  ".cm-diagnosticText": { display: "block", marginBottom: "10px" },
  ".cm-diagnosticSource": {
    display: "block",
    marginTop: "8px",
    color: "var(--mute)",
    fontSize: "11px",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  ".cm-diagnosticAction": {
    backgroundColor: "var(--accent)",
    color: "var(--on-accent)",
    border: "0",
    borderRadius: "6px",
    padding: "4px 12px",
    margin: "0 6px 6px 0",
    font: "inherit",
    fontWeight: "600",
    cursor: "pointer",
  },
  ".cm-placeholder": { color: "var(--mute)" },
  ".cm-diagnosticAction.cm-action-quiet": {
    backgroundColor: "transparent",
    color: "var(--text)",
    border: "1px solid var(--line)",
    fontWeight: "400",
  },
});
