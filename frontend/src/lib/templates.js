// What a new draft can start from. "empty" is the plain blank draft; the others are Markdown that is put into the editor.
export const TEMPLATES = [
  { id: "empty", label: "Empty draft", hint: "A blank page", text: "" },
  { id: "todo", label: "Todo list", hint: "Tasks with checkboxes", text: "# Todo\n\n- [ ] " },
  {
    id: "meeting",
    label: "Meeting notes",
    hint: "Agenda, notes and actions",
    text: "# Meeting notes\n\nDate: \nPeople: \n\n## Agenda\n\n- \n\n## Notes\n\n\n## Actions\n\n- [ ] ",
  },
];

// The text for a template id; an unknown id gives an empty draft.
export function templateText(id) {
  return TEMPLATES.find((t) => t.id === id)?.text ?? "";
}
