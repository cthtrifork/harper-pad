import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { linter } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { lintText } from "./harper.js";

// Harper's lint kinds that are plain misspellings get the error colour; the rest are suggestions about style.
function severity(kind) {
  if (kind === "Spelling") return "error";
  if (kind === "Repetition" || kind === "Grammar" || kind === "Agreement") return "warning";
  return "info";
}

// Turn a Harper suggestion into a CodeMirror lint action. The range is the diagnostic's current one, so the fix
// stays correct after the text before it has been edited.
function toAction(fix) {
  const name = fix.kind === "remove" || fix.text === "" ? "Remove" : fix.kind === "insert" ? `Insert "${fix.text}"` : fix.text;
  return {
    name,
    apply(view, from, to) {
      const change =
        fix.kind === "insert" ? { from: to, to, insert: fix.text } : { from, to, insert: fix.kind === "remove" ? "" : fix.text };
      view.dispatch({ changes: change });
    },
  };
}

// The lint source: runs Harper on the whole document (debounced by the linter extension) and maps the findings.
// onResult gets the finding count and how long Harper took, for the status line.
function harperSource(harper, onResult) {
  return linter(
    async (view) => {
      const t0 = performance.now();
      const found = await lintText(harper, view.state.doc.toString());
      onResult?.({ count: found.length, ms: Math.round(performance.now() - t0) });
      return found.map((f) => ({
        from: f.from,
        to: f.to,
        severity: severity(f.kind),
        source: f.kind,
        message: f.message,
        actions: f.fixes.map(toAction),
      }));
    },
    { delay: 300 },
  );
}

const theme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "17px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", lineHeight: "1.75" },
  ".cm-content": { caretColor: "var(--text)", padding: "0" },
  ".cm-line": { padding: "0" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 30%, transparent)",
  },
  ".cm-tooltip": { backgroundColor: "var(--panel)", color: "var(--text)", border: "1px solid var(--line)", borderRadius: "8px" },
  ".cm-tooltip-lint": { padding: "4px" },
  ".cm-diagnostic": { padding: "8px 10px", borderLeft: "0", fontSize: "13px", lineHeight: "1.45" },
  ".cm-diagnosticSource": { color: "var(--mute)", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.06em" },
  ".cm-diagnosticAction": {
    backgroundColor: "var(--accent)",
    color: "var(--bg)",
    borderRadius: "5px",
    padding: "2px 10px",
    margin: "6px 6px 0 0",
    font: "inherit",
    fontWeight: "600",
  },
});

// Create the editor in `parent`. `harper` is a WorkerLinter; `onResult` hears about every lint run.
export function createEditor(parent, { doc, harper, onResult }) {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        harperSource(harper, onResult),
        theme,
      ],
    }),
  });
}
