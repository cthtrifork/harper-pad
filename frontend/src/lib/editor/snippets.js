import { EditorState } from "@codemirror/state";

// Typing <code> alone on a line turns it into a fenced code block with its placeholder selected, so on a phone (where ``` is a hunt through the
// symbol keys) one word gives the snippet and the next thing typed replaces the placeholder.
const TRIGGER = "<code>";
const PLACEHOLDER = "Write code here";

export const codeSnippet = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged || !tr.isUserEvent("input.type")) return tr;
  let end = -1;
  tr.changes.iterChanges((_fa, _ta, _fb, toB, inserted) => {
    if (inserted.length && inserted.sliceString(inserted.length - 1) === ">") end = toB;
  });
  if (end < TRIGGER.length || tr.newDoc.sliceString(end - TRIGGER.length, end) !== TRIGGER) return tr;
  // Only when <code> is the whole line: after text, or with text after it, it is just text.
  const line = tr.newDoc.lineAt(end);
  if (line.text !== TRIGGER) return tr;
  const from = line.from;
  const anchor = from + 4; // after "```\n"
  return [
    tr,
    {
      changes: { from, to: end, insert: `\`\`\`\n${PLACEHOLDER}\n\`\`\`` },
      selection: { anchor, head: anchor + PLACEHOLDER.length },
      sequential: true,
      userEvent: "input.type",
    },
  ];
});
