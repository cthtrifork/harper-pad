// Spike: load harper.js in a Web Worker and lint text. Two binaries are tried so the spike shows which one
// survives the Wails asset server and WebKitGTK:
//   - "inlined": the wasm is base64 inside the JS bundle (no extra request, always works, ~27 MB of JS)
//   - "url": the wasm is a separate hashed asset fetched at runtime (needs application/wasm from the asset server)
export async function createLinter(flavour) {
  const [{ WorkerLinter }, bin] = await Promise.all([
    import("harper.js"),
    flavour === "url" ? import("harper.js/slimBinary") : import("harper.js/slimBinaryInlined"),
  ]);
  const binary = flavour === "url" ? bin.slimBinary : bin.slimBinaryInlined;
  const linter = new WorkerLinter({ binary });
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
