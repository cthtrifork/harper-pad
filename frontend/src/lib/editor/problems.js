import { forEachDiagnostic } from "@codemirror/lint";

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
      fixes: (d.actions ?? []).filter((a) => !a.markClass).map((a) => a.name),
      safe: d.safe === true,
    });
  });
  return out.sort((a, b) => a.from - b.from);
}

// Whether two lists from collectProblems say the same, so the panel is only told about a real change.
export function sameProblems(a, b) {
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
