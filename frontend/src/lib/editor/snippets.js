import { EditorState } from "@codemirror/state";

// Typing <code> turns it into a fenced code block with its placeholder selected, so on a phone (where ``` is a hunt through the
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
  const from = end - TRIGGER.length;
  // A block needs a line of its own.
  const lead = from === 0 || tr.newDoc.sliceString(from - 1, from) === "\n" ? "" : "\n";
  const open = `${lead}\`\`\`\n`;
  const anchor = from + open.length;
  return [
    tr,
    {
      changes: { from, to: end, insert: `${open}${PLACEHOLDER}\n\`\`\`` },
      selection: { anchor, head: anchor + PLACEHOLDER.length },
      sequential: true,
      userEvent: "input.type",
    },
  ];
});
