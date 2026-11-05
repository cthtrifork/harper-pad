import { syntaxTree } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";

// Snippets for the markdown that is a hunt through the symbol keys on a phone. Type a trigger alone on a line and press Enter: the
// line becomes the text, with the part to fill in selected so the next thing typed replaces it. Enter, not the closing `>`, so the
// whole line is known to be just the trigger. `@@` marks the selection: the text between two of them, or the caret for just one.
const SNIPPETS = {
  "<code>": "```\n@@Write code here@@\n```",
  "<sh>": "```sh\n@@Write code here@@\n```",
  "<json>": "```json\n@@Write code here@@\n```",
  "<yaml>": "```yaml\n@@Write code here@@\n```",
  "<toml>": "```toml\n@@Write code here@@\n```",
  "<todo>": "- [ ] @@",
  "<table>": "| @@Column@@ | Column |\n| --- | --- |\n| Cell | Cell |",
  "<link>": "[@@text@@](https://)",
  "<img>": "![@@alt@@](https://)",
};

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
  const body = SNIPPETS[key];
  for (let node = syntaxTree(state).resolveInner(line.from, 1); node; node = node.parent) {
    if (IN_CODE.test(node.name)) return null;
  }
  const [before, mid, after] = body.split("@@");
  const text = before + (mid ?? "") + (after ?? "");
  const anchor = line.from + before.length;
  return {
    changes: { from: line.from, to: line.to, insert: text },
    selection: { anchor, head: anchor + (mid ?? "").length },
    userEvent: "input.snippet",
    scrollIntoView: true,
  };
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
