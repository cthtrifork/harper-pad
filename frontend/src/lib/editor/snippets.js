import { syntaxTree } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

// Snippets for markdown that is slow to type (symbols, pipes, fences), on a phone most of all, but they work on every device. Type a trigger alone on a line and press Enter: the
// line becomes the text, with the part to fill in selected so the next thing typed replaces it. Enter, not the closing `>`, so the
// whole line is known to be just the trigger. `@@` marks the selection: the text between two of them, or the caret for just one.
// `about` is the line the help page shows (components/SnippetsHelp.vue draws the page from this table).
const SNIPPETS = {
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

// For the help page: each snippet's trigger, what it is, and its text cut into what comes before, what is selected and what follows.
export const SNIPPET_LIST = Object.entries(SNIPPETS).map(([trigger, { about, text }]) => {
  const [before, mid = "", after = ""] = text.split("@@");
  return { trigger, about, before, mid, after };
});

const IN_CODE = /FencedCode|CodeBlock|InlineCode/;

// The change that expands the line the caret is on, or null when it is not a trigger alone on its line (or is inside code).
export function expandSnippet(state) {
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
  for (let node = syntaxTree(state).resolveInner(line.from, 1); node; node = node.parent) {
    if (IN_CODE.test(node.name)) return null;
  }
  return snippetChange(body, line.from, line.to);
}

// Replace from..to with a snippet's text, selecting the part to fill in.
function snippetChange(body, from, to, lead = "") {
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
export function insertSnippet(state, trigger) {
  if (!Object.hasOwn(SNIPPETS, trigger)) return null;
  const { text } = SNIPPETS[trigger];
  const { from, to } = state.selection.main;
  const block = /^(```|- |\|)/.test(text);
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
