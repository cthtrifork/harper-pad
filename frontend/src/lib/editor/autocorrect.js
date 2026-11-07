import { isolateHistory } from "@codemirror/commands";
import { syntaxTree } from "@codemirror/language";
import { forEachDiagnostic } from "@codemirror/lint";
import { Annotation, StateField } from "@codemirror/state";
import { addRange, isFinished, isSpacing, nonOverlapping, touches } from "../autocorrect.js";

// Autocorrect in the editor. Kept in the editor state, so opening another draft forgets it:
//   - touched: the text the user typed or pasted. Autocorrect never fixes text that was already in the draft;
//   - fixes: what was changed, for the Recently fixed list and Undo;
//   - batch: the last set of fixes, to tell when Ctrl+Z took it back so it is not fixed again.

// Marks a transaction autocorrect made. Its value is the list of fixes, with their positions in the new text.
const autoFix = Annotation.define();

// Marks a change that came from outside the person's typing (a file's text taken into the draft): it is not "touched", so autocorrect never
// rewrites text that was only applied.
const external = Annotation.define();

let nextId = 1;

const NOT_CODE = /Code|URL|Link|Image|HTML/;

// Markdown code, links and raw HTML are left alone: the text in them is not prose.
function inCode(state, from, to) {
  for (let node = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
    if (NOT_CODE.test(node.name)) return true;
  }
  return to > from && NOT_CODE.test(syntaxTree(state).resolveInner(to, -1).name);
}

export const autoField = StateField.define({
  create: () => ({ touched: [], fixes: [], batch: null }),
  update(value, tr) {
    const mine = tr.annotation(autoFix);
    let { touched, fixes, batch } = value;
    if (tr.docChanged) {
      touched = touched.map(([a, b]) => [tr.changes.mapPos(a, -1), tr.changes.mapPos(b, 1)]);
      fixes = fixes
        .filter((f) => mine || !tr.changes.touchesRange(f.from, f.to))
        .map((f) => ({ ...f, from: tr.changes.mapPos(f.from, 1), to: tr.changes.mapPos(f.to, -1) }));
      if (!mine && !tr.annotation(external)) {
        tr.changes.iterChangedRanges((_fromA, _toA, from, to) => {
          touched = addRange(touched, from, to);
        });
      }
    }
    if (mine) {
      fixes = [...fixes, ...mine];
      batch = { before: tr.startState.doc, after: tr.newDoc, fixes: mine };
    }
    return { touched, fixes, batch };
  },
});

// Replace the document with `text` as one undoable edit that changes only what differs (the common start and end stay), so the caret and the
// scroll position stay where they were as far as the new text allows. Autocorrect does not treat it as typed.
export function replaceExternal(view, text) {
  const old = view.state.doc.toString();
  let from = 0;
  const max = Math.min(old.length, text.length);
  while (from < max && old.charCodeAt(from) === text.charCodeAt(from)) from++;
  let end = 0;
  while (end < max - from && old.charCodeAt(old.length - 1 - end) === text.charCodeAt(text.length - 1 - end)) end++;
  if (from === old.length && from === text.length) return;
  view.dispatch({
    changes: { from, to: old.length - end, insert: text.slice(from, text.length - end) },
    userEvent: "input.reload",
    annotations: [external.of(true), isolateHistory.of("full")],
  });
}

// Apply findings as one transaction that is its own step in the undo history, so Ctrl+Z takes back exactly these fixes. Each item is
// {from, to, fix: {kind, text}, problem, kind, hash}; the ones that overlap an earlier item are skipped. Returns how many were applied.
export function applyFixes(view, items) {
  const chosen = nonOverlapping(items);
  if (!chosen.length) return 0;
  let delta = 0;
  const done = [];
  const changes = chosen.map((it) => {
    const insert = it.fix.kind === "remove" ? "" : it.fix.text;
    const from = it.from + delta;
    done.push({ id: nextId++, from, to: from + insert.length, original: it.problem, replacement: insert, kind: it.kind, hash: it.hash });
    delta += insert.length - (it.to - it.from);
    return { from: it.from, to: it.to, insert };
  });
  view.dispatch({ changes, userEvent: "input.autocorrect", annotations: [autoFix.of(done), isolateHistory.of("full")] });
  return done.length;
}

// The findings autocorrect may fix now: safe ones the user has typed, that are finished and are not in code. `found` are the
// findings of one lint run on `text`; `caret` is where the cursor was.
// Extra spaces are done once the caret is past them: the word after them may still be on its way.
const finished = (text, f, caret) => (isSpacing(f.fixes[0]) ? caret > f.to : isFinished(text, f.to, caret));

export function dueFixes(state, text, found, caret) {
  const { touched } = state.field(autoField);
  return found
    .filter((f) => f.safe && touches(touched, f.from, f.to) && finished(text, f, caret) && !inCode(state, f.from, f.to))
    .map((f) => ({ from: f.from, to: f.to, fix: f.fixes[0], problem: f.problem, kind: f.kind, hash: f.hash }));
}

// "Fix all safe issues": every safe finding the linter currently shows, wherever it is. Only ones whose text is still what was found.
export function fixAllSafe(view) {
  const items = [];
  forEachDiagnostic(view.state, (d, from, to) => {
    const a = d.autofix;
    if (a && view.state.sliceDoc(from, to) === a.problem)
      items.push({ from, to, fix: a.fix, problem: a.problem, kind: d.source, hash: a.hash });
  });
  return applyFixes(view, items);
}

// Take fixes back: put the original text where the fix still is (not where the user has since edited), and tell Harper not to suggest
// it again. `ignore(entries)` does the second part. Returns how many were taken back.
export function undoFixes(view, ids, ignore) {
  const { fixes } = view.state.field(autoField);
  const wanted = fixes.filter((f) => ids.includes(f.id) && view.state.sliceDoc(f.from, f.to) === f.replacement);
  if (!wanted.length) return 0;
  view.dispatch({ changes: wanted.map((f) => ({ from: f.from, to: f.to, insert: f.original })), userEvent: "input.autocorrect-revert" });
  ignore?.(wanted);
  return wanted.length;
}

// Called for every update: reports what changed to the page. `h` has onFixes(list) (the Recently fixed list changed), onFixed(count,
// ids) (autocorrect just applied fixes), onUserEdit() (the user changed the text) and ignore(entries) (Ctrl+Z took fixes back).
export function reportAutocorrect(u, h) {
  const now = u.state.field(autoField);
  const before = u.startState.field(autoField);
  const mine = u.transactions.map((tr) => tr.annotation(autoFix)).find(Boolean);
  if (mine) h.onFixed?.(mine.map((f) => f.id));
  const edited = u.transactions.some((tr) => tr.docChanged && !tr.annotation(autoFix));
  if (edited) h.onUserEdit?.();
  // Ctrl+Z that returns the text to just before a batch: those findings must not come back.
  if (before.batch && u.transactions.some((tr) => tr.isUserEvent("undo")) && u.state.doc.eq(before.batch.before))
    h.ignore?.(before.batch.fixes);
  const ids = (list) => list.map((f) => f.id).join(",");
  if (ids(now.fixes) !== ids(before.fixes)) h.onFixes?.(now.fixes.map(({ id, original, replacement }) => ({ id, original, replacement })));
}
