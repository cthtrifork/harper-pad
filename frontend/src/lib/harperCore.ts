// What the Harper worker can be asked to do, with plain arguments and results so they cross a message channel. Apart from the worker so
// harperCore.test.js can run it against the real Harper in Node, which tells a harper.js update that changes behaviour from one that
// does not.

import type { LocalLinter } from "harper.js";

export interface Fix {
  /** Replace the problem range, remove it, or insert after it. */
  kind: "replace" | "remove" | "insert";
  text: string;
}

export interface Finding {
  kind: string;
  message: string;
  problem: string;
  /** UTF-16 offsets, as in JS strings and CodeMirror. */
  from: number;
  to: number;
  fixes: Fix[];
  /** Identifies the finding in its context; ignoring needs it later. */
  hash?: bigint;
}

const SUGGESTION_KIND: Record<number, Fix["kind"]> = { 0: "replace", 1: "remove", 2: "insert" };

export function harperMethods(linter: LocalLinter) {
  // Neither Vue nor CodeMirror holds wasm-backed Lint instances: they are freed here.
  async function lintPlain(text: string): Promise<Finding[]> {
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
          // Ignoring needs the hash later, after the Lint is freed.
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
    importWords: (words: string[]) => linter.importWords(words),
    exportWords: () => linter.exportWords(),
    ignoreLintHash: (hash: bigint) => linter.ignoreLintHash(hash),
    exportIgnoredLints: () => linter.exportIgnoredLints(),
    importIgnoredLints: (json: string) => linter.importIgnoredLints(json),
    clearIgnoredLints: () => linter.clearIgnoredLints(),
    dispose: () => linter.dispose(),
  };
}
