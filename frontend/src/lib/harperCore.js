// What the Harper worker can be asked to do: each method takes plain arguments and returns plain data, so it can cross a message
// channel. Kept apart from the worker itself so a test can run it against the real Harper in Node (harperCore.test.js), which is what
// tells a harper.js update that changes behaviour from one that does not.

// How a Harper suggestion edits the problem range: replace it, remove it, or insert after it.
const SUGGESTION_KIND = { 0: "replace", 1: "remove", 2: "insert" };

// `linter` is a harper.js LocalLinter.
export function harperMethods(linter) {
  // Lint the text and return plain objects (spans are UTF-16 offsets, as in JS strings and CodeMirror), so neither Vue nor CodeMirror
  // state ever holds wasm-backed Lint instances. Those are freed here.
  async function lintPlain(text) {
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

  return {
    setup: () => linter.setup(),
    lintPlain,
    importWords: (words) => linter.importWords(words),
    exportWords: () => linter.exportWords(),
    ignoreLintHash: (hash) => linter.ignoreLintHash(hash),
    exportIgnoredLints: () => linter.exportIgnoredLints(),
    importIgnoredLints: (json) => linter.importIgnoredLints(json),
    clearIgnoredLints: () => linter.clearIgnoredLints(),
    dispose: () => linter.dispose(),
  };
}
