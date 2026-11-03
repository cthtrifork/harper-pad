// Load harper.js in a Web Worker and lint text. The wasm is a separate hashed asset fetched at runtime (needs
// application/wasm from the asset server); it works in WebKitGTK.
export async function createLinter() {
  const [{ WorkerLinter }, { slimBinary }] = await Promise.all([import("harper.js"), import("harper.js/slimBinary")]);
  const linter = new WorkerLinter({ binary: slimBinary });
  await linter.setup();
  return linter;
}

// Plain objects, so Vue state never holds wasm-backed Lint instances (which need free()).
export async function lintText(linter, text) {
  const lints = await linter.lint(text);
  return lints.map((l) => {
    const span = l.span();
    return {
      kind: l.lint_kind_pretty(),
      message: l.message(),
      problem: l.get_problem_text(),
      start: span.start,
      end: span.end,
      suggestions: l.suggestions().length,
    };
  });
}
