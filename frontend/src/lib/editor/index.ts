import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { forEachDiagnostic } from "@codemirror/lint";
import { Compartment, EditorState, type Extension, type Text } from "@codemirror/state";
import { dropCursor, EditorView, keymap, placeholder } from "@codemirror/view";
import type { Prefs } from "../autocorrect.ts";
import type { HarperLinter } from "../harper.ts";
import { autoField, fixAllSafe, replaceExternal, reportAutocorrect, undoFixes } from "./autocorrect.ts";
import { harperSource, type PersistNote, relint } from "./lint.ts";
import { loadMarkdownMode, markdownLoaded, type Mode, modeExtensions } from "./mode.ts";
import { collectProblems, type Problem, sameProblems } from "./problems.ts";
import { countDoc, cursorOf } from "./stats.ts";
import { theme } from "./theme.ts";

export { fixAllSafe, relint, replaceExternal };

// Take autocorrect's fixes back (the toast's Undo all, a row's Undo): the text returns and Harper ignores the finding from now on.
export function revertFixes(view: EditorView, ids: number[]) {
  return undoFixes(view, ids, (editors.get(view) as Entry).ctx.ignore);
}

export function jumpTo(view: EditorView, from: number, to: number) {
  view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
  view.focus();
}

export function applyFix(view: EditorView, from: number, to: number, i: number) {
  forEachDiagnostic(view.state, (d, f, t) => {
    if (f === from && t === to) d.actions?.[i]?.apply(view, f, t);
  });
}

// What each editor was created with, so loadDocument can build a fresh state with the same behaviour and report only changes.
// The format ("markdown" or "text") lives in its own compartment, which is the first extension, so it can be switched without
// losing the text or the undo history.
interface Ctx {
  onStats?: (stats: Stats) => void;
  onCursor?: (cursor: ReturnType<typeof cursorOf>) => void;
  stats: Stats | null;
  problems: Problem[];
  settling: Promise<void> | null;
  ignore: (entries: { hash: bigint | undefined; original: string; kind: string | undefined }[]) => void;
}

interface Entry {
  extensions: Extension[];
  ctx: Ctx;
  mode: Compartment;
  current: Mode;
}

type Stats = ReturnType<typeof countDoc>;

const editors = new WeakMap<EditorView, Entry>();
const DEFAULT_MODE: Mode = { format: "markdown", source: false };

// `getHarper` returns null while Harper is still loading.
export interface EditorOptions {
  doc: string;
  mode?: Mode;
  getHarper: () => HarperLinter | null;
  onResult?: (r: { count: number; ms: number }) => void;
  onProblems?: (list: Problem[]) => void;
  onStats?: (stats: Stats) => void;
  onCursor?: (cursor: ReturnType<typeof cursorOf>) => void;
  onDoc?: (text: string) => void;
  onEdit?: () => void;
  persist?: (note?: PersistNote) => unknown;
  getAutocorrect?: () => Prefs | undefined;
  onFixes?: (list: { id: number; original: string; replacement: string }[]) => void;
  onFixed?: (ids: number[]) => void;
  onUserEdit?: () => void;
}

export function createEditor(
  parent: HTMLElement,
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
  }: EditorOptions,
) {
  const ctx = { onStats, onCursor, stats: null, problems: [], settling: null } as unknown as Ctx;
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

// The markdown parser is loaded after the first paint (mode.ts): a markdown document first shows as plain text, and once it has
// arrived the mode is applied again, to whatever mode the editor is in by then. The document and its undo history are untouched.
function catchUpMode(view: EditorView) {
  const entry = editors.get(view) as Entry;
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
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, 300);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
}

function reportStats(ctx: Ctx, doc: Text) {
  const next = countDoc(doc);
  if (ctx.stats && ctx.stats.words === next.words && ctx.stats.chars === next.chars) return;
  ctx.stats = next;
  ctx.onStats?.(next);
}

export function setMode(view: EditorView, mode: Mode) {
  const entry = editors.get(view) as Entry;
  entry.current = mode;
  catchUpMode(view);
  view.dispatch({ effects: entry.mode.reconfigure(modeExtensions(mode)) });
}

// Replace the whole document, as when another draft is opened. It starts a fresh state, so undo cannot cross into the previous
// document, and it does not count as an edit. The stats and the caret are reported again, because no update is reported for it.
// `keepSelection` is for showing a newer copy of the draft that is already open (a background sync): the selection stays where it was
// (cut to the new length) instead of falling back to the start, or the next key would act on the wrong text.
export function loadDocument(
  view: EditorView,
  text: string,
  onStats?: (stats: Stats) => void,
  mode: Mode = DEFAULT_MODE,
  onDoc?: (text: string) => void,
  onCursor?: (cursor: ReturnType<typeof cursorOf>) => void,
  keepSelection = false,
) {
  const entry = editors.get(view) as Entry;
  const { extensions, ctx, mode: compartment } = entry;
  const { anchor, head } = view.state.selection.main;
  const hadFocus = view.hasFocus;
  entry.current = mode;
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
