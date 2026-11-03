// Load harper.js in a Web Worker and lint text. The wasm is a separate hashed asset fetched at runtime (needs
// application/wasm from the asset server); it works in WebKitGTK.
// `dialect` is harper.js's Dialect enum value (see DIALECTS in personal.js); left out, Harper uses American English.
export async function createLinter(dialect) {
  const [{ WorkerLinter }, { slimBinary }] = await Promise.all([import("harper.js"), import("harper.js/slimBinary")]);
  const linter = new WorkerLinter({ binary: slimBinary, dialect });
  await linter.setup();
  return linter;
}

// How a Harper suggestion edits the problem range: replace it, remove it, or insert after it.
const SUGGESTION_KIND = { 0: "replace", 1: "remove", 2: "insert" };

// Lint the text and return plain objects (spans are UTF-16 offsets, as in JS strings and CodeMirror), so neither Vue nor CodeMirror state ever holds
// wasm-backed Lint instances. Those are freed here.
export async function lintText(linter, text) {
  const lints = await linter.lint(text);
  try {
    return await Promise.all(
      lints.map(async (l) => {
        const span = l.span();
        const fixes = l.suggestions().map((sug) => {
          const fix = { kind: SUGGESTION_KIND[sug.kind()] ?? "replace", text: sug.get_replacement_text() };
          sug.free();
          return fix;
        });
        // The hash identifies this finding in its context. Ignoring needs it later, after the Lint object is freed.
        const hash = await linter.contextHash(text, l).catch(() => undefined);
        return {
          kind: l.lint_kind_pretty(),
          message: l.message(),
          problem: l.get_problem_text(),
          from: span.start,
          to: span.end,
          fixes,
          hash,
        };
      }),
    );
  } finally {
    for (const l of lints) l.free();
  }
}
