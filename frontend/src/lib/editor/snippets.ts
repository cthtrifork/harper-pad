import { syntaxTree } from "@codemirror/language";
import { type EditorState, Prec, type TransactionSpec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

// Markdown that is slow to type (symbols, pipes, fences), on a phone most of all. A trigger alone on a line, then Enter, becomes the text
// with the part to fill in selected (Enter, not the closing `>`, so the whole line is known to be just the trigger). `@@` marks the
// selection: the text between two of them, or the caret for one. SnippetsHelp.vue draws the help page from this table.
const SNIPPETS: Record<string, { about: string; text: string }> = {
  "<code>": { about: "Code block", text: "```\n@@Write code here@@\n```" },
  "<sh>": { about: "Shell code block", text: "```sh\n@@Write code here@@\n```" },
  "<json>": { about: "JSON code block", text: "```json\n@@Write code here@@\n```" },
  "<yaml>": { about: "YAML code block", text: "```yaml\n@@Write code here@@\n```" },
  "<toml>": { about: "TOML code block", text: "```toml\n@@Write code here@@\n```" },
  "<todo>": { about: "Task with a box", text: "- [ ] @@" },
  "<table>": { about: "Table", text: "| @@Column@@ | Column |\n| --- | --- |\n| Cell | Cell |" },
  "<link>": { about: "Link", text: "[@@text@@](https://)" },
  "<img>": { about: "Image", text: "![@@alt@@](https://)" },
};

// The text is cut into what comes before the selection, the selection and what follows.
export const SNIPPET_LIST = Object.entries(SNIPPETS).map(([trigger, { about, text }]) => {
  const [before, mid = "", after = ""] = text.split("@@");
  return { trigger, about, before, mid, after };
});

const IN_CODE = /FencedCode|CodeBlock|InlineCode/;

// null unless the caret is on a trigger alone on its line, outside code.
export function expandSnippet(state: EditorState): TransactionSpec | null {
  const { main } = state.selection;
  if (!main.empty) return null;
  const line = state.doc.lineAt(main.head);
  // Spaces around it do not count: after a line with HTML the editor indents the next one on its own.
  const key = line.text.trim();
  if (
    !Object.hasOwn(SNIPPETS, key) ||
    state.sliceDoc(line.from, main.head).trim() !== key ||
    main.head < line.from + line.text.trimEnd().length
  )
    return null;
  const { text: body } = SNIPPETS[key];
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(line.from, 1); node; node = node.parent) {
    if (IN_CODE.test(node.name)) return null;
  }
  return snippetChange(body, line.from, line.to);
}

function snippetChange(body: string, from: number, to: number, lead = ""): TransactionSpec {
  const [before, mid = "", after = ""] = body.split("@@");
  const anchor = from + lead.length + before.length;
  return {
    changes: { from, to, insert: lead + before + mid + after },
    selection: { anchor, head: anchor + mid.length },
    userEvent: "input.snippet",
    scrollIntoView: true,
  };
}

// The help page's shortcut: put a snippet where the cursor is (in place of a selection). A block (a fence, a task, a table) needs
// a line of its own, so it starts on a new line when the cursor is not at the start of one; a link or image goes in the text.
export function insertSnippet(state: EditorState, trigger: string): TransactionSpec | null {
  if (!Object.hasOwn(SNIPPETS, trigger)) return null;
  const { text } = SNIPPETS[trigger];
  let { from, to } = state.selection.main;
  // Inside a fenced block (such as the placeholder the last snippet left selected) the snippet goes after the block, so inserting
  // several in a row stacks them instead of each replacing the one before.
  let after = false;
  for (let node: SyntaxNode | null = syntaxTree(state).resolveInner(from, 1); node; node = node.parent) {
    if (node.name === "FencedCode") {
      from = to = node.to;
      after = true;
      break;
    }
  }
  const block = after || /^(```|- |\|)/.test(text);
  const lead = block && state.doc.lineAt(from).from !== from ? "\n" : "";
  return snippetChange(text, from, to, lead);
}

export const snippets = Prec.high(
  keymap.of([
    {
      key: "Enter",
      run(view) {
        const spec = expandSnippet(view.state);
        if (!spec) return false;
        view.dispatch(spec);
        return true;
      },
    },
  ]),
);
