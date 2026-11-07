import type { Parser } from "@lezer/common";
import { classHighlighter, highlightTree } from "@lezer/highlight";

// Colours for fenced code in the preview. Each language is a lazy chunk. The result is runs of text, never HTML, so draft text can only
// become text nodes (docs/security.md).

// By the name written after the ``` fence.
const loaders: Record<string, () => Promise<Parser>> = {
  shell: () => import("@codemirror/legacy-modes/mode/shell").then((m) => streamParser(m.shell)),
  toml: () => import("@codemirror/legacy-modes/mode/toml").then((m) => streamParser(m.toml)),
  json: () => import("@codemirror/lang-json").then((m) => m.jsonLanguage.parser),
  yaml: () => import("@codemirror/lang-yaml").then((m) => m.yamlLanguage.parser),
};

const aliases: Record<string, string> = {
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  console: "shell",
  shellscript: "shell",
  jsonc: "json",
  yml: "yaml",
};

async function streamParser(mode: Parameters<typeof import("@codemirror/language").StreamLanguage.define>[0]) {
  const { StreamLanguage } = await import("@codemirror/language");
  return StreamLanguage.define(mode).parser;
}

// From a fence's info string ("bash title=x"); null when there are no colours for it.
export function languageFor(info?: string | null): string | null {
  const name = String(info ?? "")
    .trim()
    .split(/[\s{]/)[0]
    .toLowerCase();
  const key = aliases[name] ?? name;
  return Object.hasOwn(loaders, key) ? key : null;
}

const parsers = new Map<string, Promise<Parser>>(); // language -> promise of its parser

function loadParser(lang: string): Promise<Parser> {
  if (!parsers.has(lang)) parsers.set(lang, loaders[lang]());
  return parsers.get(lang) as Promise<Parser>;
}

// Runs join back into `code`; cls is "" for plain text.
export async function highlight(code: string, lang: string) {
  const parser = await loadParser(lang);
  const runs: { text: string; cls: string }[] = [];
  let at = 0;
  const push = (to: number, cls: string) => {
    if (to > at) runs.push({ text: code.slice(at, to), cls });
    at = Math.max(at, to);
  };
  highlightTree(parser.parse(code), classHighlighter, (from, to, cls) => {
    push(from, "");
    push(to, cls);
  });
  push(code.length, "");
  return runs;
}
