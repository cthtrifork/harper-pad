import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { forEachDiagnostic, linter } from "@codemirror/lint";
import { EditorState, StateEffect } from "@codemirror/state";
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

// Dispatched to make the linter run again without a text change, for example when Harper has just finished loading.
const relintEffect = StateEffect.define();

// The lint source: runs Harper on the whole document (debounced by the linter extension) and maps the findings.
// onResult gets the finding count and how long Harper took, for the status line.
function harperSource(getHarper, onResult) {
  return linter(
    async (view) => {
      const harper = getHarper();
      if (!harper) return [];
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
    { delay: 300, needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(relintEffect))) },
  );
}

const underline = (color) => ({
  backgroundImage: "none",
  textDecoration: `underline wavy ${color}`,
  textDecorationThickness: "1.5px",
  textUnderlineOffset: "5px",
});

const theme = EditorView.theme({
  "&": { color: "var(--text)", backgroundColor: "transparent", fontSize: "19px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "var(--font-doc)", lineHeight: "1.75" },
  ".cm-content": { caretColor: "var(--accent)", padding: "0" },
  ".cm-line": { padding: "0" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "color-mix(in srgb, var(--accent) 28%, transparent)",
  },
  ".cm-lintRange-error": underline("var(--c-spelling)"),
  ".cm-lintRange-warning": underline("var(--c-grammar)"),
  ".cm-lintRange-info": underline("var(--c-style)"),
  ".cm-lintRange-active": { backgroundColor: "color-mix(in srgb, var(--accent) 22%, transparent)", borderRadius: "3px" },
  ".cm-tooltip": {
    backgroundColor: "var(--raised)",
    color: "var(--text)",
    border: "1px solid var(--line)",
    borderRadius: "10px",
    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.35)",
    fontFamily: "var(--font-ui)",
  },
  ".cm-tooltip-lint": { maxWidth: "340px", padding: "4px" },
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
    margin: "0 6px 0 0",
    font: "inherit",
    fontWeight: "600",
    cursor: "pointer",
  },
});

// Every current finding with its position mapped through later edits, as plain objects for the Problems panel.
export function collectProblems(view) {
  const out = [];
  forEachDiagnostic(view.state, (d, from, to) => {
    out.push({
      kind: d.source,
      severity: d.severity,
      message: d.message,
      problem: view.state.sliceDoc(from, to),
      from,
      to,
      fixes: (d.actions ?? []).map((a) => a.name),
    });
  });
  return out.sort((a, b) => a.from - b.from);
}

// Run the lint source again now, e.g. when Harper has just finished loading. CodeMirror's forceLinting does not start
// a new run (it only brings a scheduled one forward), so the editor asks the linter to refresh with an effect instead.
export function relint(view) {
  view.dispatch({ effects: relintEffect.of(null) });
}

// Select the range of a finding and bring it into view.
export function jumpTo(view, from, to) {
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  view.focus();
}

// Apply the i-th fix of the finding currently at from..to.
export function applyFix(view, from, to, i) {
  forEachDiagnostic(view.state, (d, f, t) => {
    if (f === from && t === to) d.actions?.[i]?.apply(view, f, t);
  });
}

// Create the editor in `parent`. `getHarper` returns the WorkerLinter, or null while it is still loading; `onResult` hears about every lint run and `onProblems` gets the current findings after every update.
export function createEditor(parent, { doc, getHarper, onResult, onProblems }) {
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.lineWrapping,
        harperSource(getHarper, onResult),
        theme,
        EditorView.updateListener.of((u) => onProblems?.(collectProblems(u.view))),
      ],
    }),
  });
}
