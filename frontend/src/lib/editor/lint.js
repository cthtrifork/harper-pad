import { linter } from "@codemirror/lint";
import { StateEffect } from "@codemirror/state";
import { isSafe, isSpacing } from "../autocorrect.ts";
import { lintText } from "../harper.ts";
import { applyFixes, dueFixes } from "./autocorrect.js";

// Harper's lint kinds that are plain misspellings get the error colour; the rest are suggestions about style.
function severity(kind) {
  if (kind === "Spelling") return "error";
  if (kind === "Repetition" || kind === "Grammar" || kind === "Agreement") return "warning";
  return "info";
}

// Turn a Harper suggestion into a CodeMirror lint action. The range is the diagnostic's current one, so the fix
// stays correct after the text before it has been edited.
function toAction(fix) {
  // A fix that is only spaces has no visible text, so it needs a name (an empty label is an empty button).
  const name =
    fix.kind === "remove" || fix.text === ""
      ? "Remove"
      : fix.kind === "insert"
        ? `Insert "${fix.text}"`
        : isSpacing(fix)
          ? fix.text === " "
            ? "Use one space"
            : "Use spacing"
          : fix.text;
  return {
    name,
    apply(view, from, to) {
      const change =
        fix.kind === "insert" ? { from: to, to, insert: fix.text } : { from, to, insert: fix.kind === "remove" ? "" : fix.text };
      view.dispatch({ changes: change });
    },
  };
}

// Dispatched to make the linter run again without a text change, for example when Harper has just finished loading or the
// dictionary or the ignore list changed.
const relintEffect = StateEffect.define();

// Actions that change what Harper remembers: add the word to the dictionary (spelling only), or ignore this one
// finding in its context (persist gets its hash and a label, so the list of ignored findings can say what it was). persist() saves the new state; the editor then lints again so the underline goes away.
// markClass styles them as quieter than the fixes, and keeps them out of the Problems panel's fix list.
function personalActions(harper, f, persist) {
  const run = (work, note) => async (view) => {
    try {
      await work();
      await persist(note);
    } finally {
      relint(view);
    }
  };
  const actions = [];
  if (f.kind === "Spelling") {
    actions.push({ name: "Add to dictionary", markClass: "cm-action-quiet", apply: run(() => harper.importWords([f.problem])) });
  }
  if (f.hash !== undefined) {
    actions.push({
      name: "Ignore this one",
      markClass: "cm-action-quiet",
      apply: run(() => harper.ignoreLintHash(f.hash), { ignoredHash: f.hash, label: `${f.problem.slice(0, 40)} (${f.kind})` }),
    });
  }
  return actions;
}

// The lint source: runs Harper on the whole document and maps the findings. `auto` is { prefs(), settle() }: the autocorrect
// choices, and a promise to wait for before linting.
export function harperSource(getHarper, onResult, persist, auto) {
  return linter(
    async (view) => {
      const harper = getHarper();
      if (!harper) return [];
      await auto?.settle();
      const t0 = performance.now();
      const doc = view.state.doc;
      const text = doc.toString();
      const prefs = auto?.prefs();
      const found = (await lintText(harper, text)).map((f) => ({
        ...f,
        safe: prefs ? isSafe(f, prefs, text) : false,
      }));
      onResult?.({ count: found.length, ms: Math.round(performance.now() - t0) });
      // With autocorrect on, fix what is due. Only if the text is the text that was checked: CodeMirror drops a result for older text
      // anyway, and the fixes' positions would be wrong. The edit makes the linter run again, which reports what is left.
      if (prefs?.on && view.state.doc === doc) {
        const due = dueFixes(view.state, text, found, view.state.selection.main.head);
        if (due.length && applyFixes(view, due)) return [];
      }
      return found.map((f) => ({
        from: f.from,
        to: f.to,
        severity: severity(f.kind),
        source: f.kind,
        message: f.message,
        actions: [...f.fixes.map(toAction), ...personalActions(harper, f, persist)],
        // For "Fix all safe issues": a finding with one clear fix carries it (see autocorrect.js).
        ...(f.safe ? { safe: true, autofix: { fix: f.fixes[0], problem: f.problem, hash: f.hash } } : {}),
      }));
    },
    { delay: 300, needsRefresh: (update) => update.transactions.some((tr) => tr.effects.some((e) => e.is(relintEffect))) },
  );
}

// Run the lint source again now, e.g. when Harper has just finished loading. CodeMirror's forceLinting does not start
// a new run (it only brings a scheduled one forward), so the editor asks the linter to refresh with an effect instead.
export function relint(view) {
  view.dispatch({ effects: relintEffect.of(null) });
}
