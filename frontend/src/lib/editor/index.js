import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { autoField, fixAllSafe, reportAutocorrect, undoFixes } from "./autocorrect.js";
import { harperSource, relint } from "./lint.js";
import { modeExtensions } from "./mode.js";
import { collectProblems, sameProblems } from "./problems.js";
import { countDoc, cursorOf } from "./stats.js";
import { theme } from "./theme.js";

export { collectProblems, countDoc, cursorOf, fixAllSafe, relint };

// Take autocorrect's fixes back (the toast's Undo all, a row's Undo): the text returns and Harper ignores the finding from now on.
export function revertFixes(view, ids) {
  return undoFixes(view, ids, editors.get(view).ctx.ignore);
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

// What each editor was created with, so loadDocument can build a fresh state with the same behaviour and report only changes.
// The format ("markdown" or "text") lives in its own compartment, which is the first extension, so it can be switched without
// losing the text or the undo history.
const editors = new WeakMap();
const DEFAULT_MODE = { format: "markdown", source: false };

// Create the editor in `parent`. `getHarper` returns the WorkerLinter, or null while it is still loading.
// Callbacks (all optional): `onResult` hears about every lint run; `onProblems` gets the findings when they change; `onStats` the word
// and character counts at the start and when they change; `onCursor` the caret position and selection size at the start and whenever
// they change; `onDoc` the whole text at the start and after every change (for the preview); `onEdit` is called after every change the user makes to the text (not when a document is loaded). `persist` saves the
// dictionary and ignore list after a change. Autocorrect: `getAutocorrect` returns the user's choices (see lib/autocorrect.js);
// `onFixes` gets the Recently fixed list when it changes, `onFixed` the ids of fixes just applied, `onUserEdit` is called when the user
// (not autocorrect) changes the text.
export function createEditor(
  parent,
  {
    doc,
    mode: initialMode = DEFAULT_MODE,
    getHarper,
    onResult,
    onProblems,
    onStats,
    onCursor,
    onDoc,
    onEdit,
    persist,
    getAutocorrect,
    onFixes,
    onFixed,
    onUserEdit,
  },
) {
  const ctx = { onStats, onCursor, stats: null, problems: [], settling: null };
  // Ctrl+Z took fixes back: tell Harper to ignore those findings so they are not fixed again. The next lint waits for this.
  ctx.ignore = (entries) => {
    ctx.settling = (async () => {
      const harper = getHarper();
      for (const e of entries) {
        if (!harper || e.hash === undefined) continue;
        try {
          await harper.ignoreLintHash(e.hash);
          await persist?.({ ignoredHash: e.hash, label: `${e.original.slice(0, 40)} (${e.kind})` });
        } catch {
          // the fix was still taken back; it may be offered again
        }
      }
      relint(view);
    })();
  };
  const auto = { prefs: () => getAutocorrect?.(), settle: () => ctx.settling ?? Promise.resolve() };
  const mode = new Compartment();
  const extensions = [
    mode.of(modeExtensions(initialMode)),
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ "aria-label": "Document" }), // the textbox needs an accessible name
    placeholder("Start writing. Harper checks as you type, and nothing leaves this computer."),
    autoField,
    harperSource(getHarper, onResult, persist, auto),
    theme,
    EditorView.updateListener.of((u) => {
      reportAutocorrect(u, { onFixes, onFixed, onUserEdit, ignore: ctx.ignore });
      if (u.docChanged) {
        reportStats(ctx, u.state.doc);
        onDoc?.(u.state.doc.toString());
        onEdit?.();
      }
      if (u.docChanged || u.selectionSet) onCursor?.(cursorOf(u.state));
      // The findings only change with the text (their positions move) or when a lint run delivers them (an effect). A plain caret move
      // or selection carries neither, so skip walking every diagnostic for it.
      if (u.docChanged || u.transactions.some((tr) => tr.effects.length > 0)) {
        const list = collectProblems(u.view);
        if (!sameProblems(list, ctx.problems)) {
          ctx.problems = list;
          onProblems?.(list);
        }
      }
    }),
  ];
  const view = new EditorView({ parent, state: EditorState.create({ doc, extensions }) });
  editors.set(view, { extensions, ctx, mode });
  reportStats(ctx, view.state.doc);
  onDoc?.(view.state.doc.toString());
  onCursor?.(cursorOf(view.state));
  return view;
}

function reportStats(ctx, doc) {
  const next = countDoc(doc);
  if (ctx.stats && ctx.stats.words === next.words && ctx.stats.chars === next.chars) return;
  ctx.stats = next;
  ctx.onStats?.(next);
}

// Switch the format (markdown or text) and whether it is the Split source pane, without touching the document.
export function setMode(view, mode) {
  view.dispatch({ effects: editors.get(view).mode.reconfigure(modeExtensions(mode)) });
}

// Replace the whole document, as when another draft is opened. It starts a fresh state, so undo cannot cross into the previous
// document, and it does not count as an edit. The stats and the caret are reported again, because no update is reported for it.
export function loadDocument(view, text, onStats, mode = DEFAULT_MODE, onDoc, onCursor) {
  const { extensions, ctx, mode: compartment } = editors.get(view);
  const withMode = extensions.map((e, i) => (i === 0 ? compartment.of(modeExtensions(mode)) : e));
  view.setState(EditorState.create({ doc: text, extensions: withMode }));
  ctx.stats = null; // a new document always reports, even if the counts match
  const next = countDoc(view.state.doc);
  ctx.stats = next;
  onStats?.(next);
  onDoc?.(text);
  onCursor?.(cursorOf(view.state));
  view.focus();
}
