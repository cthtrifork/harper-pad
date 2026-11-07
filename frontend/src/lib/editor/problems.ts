import { type Diagnostic, forEachDiagnostic } from "@codemirror/lint";
import type { EditorView } from "@codemirror/view";

export interface Problem {
  kind: string | undefined;
  severity: Diagnostic["severity"];
  message: string;
  problem: string;
  from: number;
  to: number;
  /** The names of the fix actions, without the quiet personal ones. */
  fixes: string[];
  safe: boolean;
}

// Every current finding with its position mapped through later edits, as plain objects for the Problems panel.
export function collectProblems(view: EditorView): Problem[] {
  const out: Problem[] = [];
  forEachDiagnostic(view.state, (d: Diagnostic & { safe?: boolean }, from, to) => {
    out.push({
      kind: d.source,
      severity: d.severity,
      message: d.message,
      problem: view.state.sliceDoc(from, to),
      from,
      to,
      fixes: (d.actions ?? []).filter((a) => !a.markClass).map((a) => a.name),
      safe: d.safe === true,
    });
  });
  return out.sort((a, b) => a.from - b.from);
}

// Whether two lists from collectProblems say the same, so the panel is only told about a real change.
export function sameProblems(a: Problem[], b: Problem[]) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.from !== y.from || x.to !== y.to || x.kind !== y.kind || x.message !== y.message || x.problem !== y.problem || x.safe !== y.safe)
      return false;
    if (x.fixes.length !== y.fixes.length || x.fixes.some((f, j) => f !== y.fixes[j])) return false;
  }
  return true;
}
