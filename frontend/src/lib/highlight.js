import { classHighlighter, highlightTree } from "@lezer/highlight";

// Syntax colours for fenced code in the preview. Each language is its own lazy chunk, so the editor does not pay for them until a
// draft has a code block in that language. The result is a list of { text, cls } runs, never HTML: Preview.vue turns them into
// Vue elements, so text from a draft can only become text nodes (docs/security.md).

// Names people write after the ``` fence -> the loader of the parser for it.
const loaders = {
  shell: () => import("@codemirror/legacy-modes/mode/shell").then((m) => streamParser(m.shell)),
  toml: () => import("@codemirror/legacy-modes/mode/toml").then((m) => streamParser(m.toml)),
  json: () => import("@codemirror/lang-json").then((m) => m.jsonLanguage.parser),
  yaml: () => import("@codemirror/lang-yaml").then((m) => m.yamlLanguage.parser),
};

const aliases = {
  sh: "shell",
  bash: "shell",
  zsh: "shell",
  console: "shell",
  shellscript: "shell",
  jsonc: "json",
  yml: "yaml",
};

async function streamParser(mode) {
  const { StreamLanguage } = await import("@codemirror/language");
  return StreamLanguage.define(mode).parser;
}

// The language named by a fence's info string ("sh", "bash title=x"), or null when it has no colours here.
export function languageFor(info) {
  const name = String(info ?? "")
    .trim()
    .split(/[\s{]/)[0]
    .toLowerCase();
  const key = aliases[name] ?? name;
  return Object.hasOwn(loaders, key) ? key : null;
}

const parsers = new Map(); // language -> promise of its parser

export function loadParser(lang) {
  if (!parsers.has(lang)) parsers.set(lang, loaders[lang]());
  return parsers.get(lang);
}

// Cut `code` into runs with the class of the token each one is ("tok-string"; "" for plain text). The runs join back into `code`.
export async function highlight(code, lang) {
  const parser = await loadParser(lang);
  const runs = [];
  let at = 0;
  const push = (to, cls) => {
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
