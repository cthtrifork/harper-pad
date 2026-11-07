import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { Compartment, EditorState } from "@codemirror/state";
import { dropCursor, EditorView, keymap, placeholder } from "@codemirror/view";
import { autoField, fixAllSafe, reportAutocorrect, undoFixes } from "./autocorrect.js";
import { harperSource, relint } from "./lint.js";
import { loadMarkdownMode, markdownLoaded, modeExtensions } from "./mode.js";
import { collectProblems, sameProblems } from "./problems.js";
import { countDoc, cursorOf } from "./stats.js";
import { theme } from "./theme.js";

export { fixAllSafe, relint };

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

// Create the editor in `parent`. `getHarper` returns the WorkerLinter, or null while it is still loading. The `on*` callbacks are all
// optional and report what the editor shows (results, problems, stats, cursor, the text for the preview, edits, autocorrect fixes);
// `persist` saves the dictionary and ignore list after a change, `getAutocorrect` returns the user's choices.
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
    dropCursor(),
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
  editors.set(view, { extensions, ctx, mode, current: initialMode });
  catchUpMode(view);
  reportStats(ctx, view.state.doc);
  onDoc?.(view.state.doc.toString());
  onCursor?.(cursorOf(view.state));
  return view;
}

// The markdown parser is loaded after the first paint (mode.js): a markdown document first shows as plain text, and once it has
// arrived the mode is applied again, to whatever mode the editor is in by then. The document and its undo history are untouched.
function catchUpMode(view) {
  const entry = editors.get(view);
  if (entry.current.format !== "markdown" || markdownLoaded()) return;
  afterNextPaint()
    .then(loadMarkdownMode)
    .then(() => {
      const now = editors.get(view);
      if (now && view.dom.isConnected) view.dispatch({ effects: now.mode.reconfigure(modeExtensions(now.current)) });
    })
    .catch(() => {}); // stays plain text; the editor works without it
}

// One frame after the editor has been painted; the timer is the fallback for a hidden window, where no animation frames run.
function afterNextPaint() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 300);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}

function reportStats(ctx, doc) {
  const next = countDoc(doc);
  if (ctx.stats && ctx.stats.words === next.words && ctx.stats.chars === next.chars) return;
  ctx.stats = next;
  ctx.onStats?.(next);
}

// Switch the format (markdown or text) and whether it is the Split source pane, without touching the document.
export function setMode(view, mode) {
  editors.get(view).current = mode;
  catchUpMode(view);
  view.dispatch({ effects: editors.get(view).mode.reconfigure(modeExtensions(mode)) });
}

// Replace the whole document, as when another draft is opened. It starts a fresh state, so undo cannot cross into the previous
// document, and it does not count as an edit. The stats and the caret are reported again, because no update is reported for it.
// `keepSelection` is for showing a newer copy of the draft that is already open (a background sync): the selection stays where it was
// (cut to the new length) instead of falling back to the start, or the next key would act on the wrong text.
export function loadDocument(view, text, onStats, mode = DEFAULT_MODE, onDoc, onCursor, keepSelection = false) {
  const { extensions, ctx, mode: compartment } = editors.get(view);
  const { anchor, head } = view.state.selection.main;
  const hadFocus = view.hasFocus;
  editors.get(view).current = mode;
  catchUpMode(view);
  const withMode = extensions.map((e, i) => (i === 0 ? compartment.of(modeExtensions(mode)) : e));
  const selection = keepSelection ? { anchor: Math.min(anchor, text.length), head: Math.min(head, text.length) } : undefined;
  view.setState(EditorState.create({ doc: text, selection, extensions: withMode }));
  ctx.stats = null; // a new document always reports, even if the counts match
  const next = countDoc(view.state.doc);
  ctx.stats = next;
  onStats?.(next);
  onDoc?.(text);
  onCursor?.(cursorOf(view.state));
  // A newer copy swapped in by a background sync (or a restore) is not a tap: focusing then would raise iOS's bare accessory bar.
  if (!keepSelection || hadFocus) view.focus();
}
