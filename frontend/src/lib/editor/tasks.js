import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import { RangeSetBuilder } from "@codemirror/state";
import { Decoration, EditorView, ViewPlugin, WidgetType } from "@codemirror/view";

// A task list marker at the start of a line: a bullet (`-`, `*`, `+`) or a number (`1.`, `1)`), a space, then `[ ]` or `[x]`
// that is followed by a space or the end of the line (so `[x]y` and `[link](url)` are not tasks).
const TASK = /^(\s*(?:[-*+]|\d{1,9}[.)])[ \t]+)\[([ xX])\](?=[ \t]|$)/;

// The task marker on one line of text, or null. `from` is the offset of the `[`, `to` the offset after the `]`, and `checked` says
// whether it is ticked. Offsets are relative to the start of `text`.
export function parseTask(text) {
  const m = TASK.exec(text);
  if (!m) return null;
  const from = m[1].length;
  return { from, to: from + 3, checked: m[2] !== " " };
}

// The change that ticks or unticks the marker at `from` (as returned by parseTask, plus the line's start).
export function toggleChange(from, checked) {
  return { from: from + 1, to: from + 2, insert: checked ? " " : "x" };
}

const IN_CODE = /FencedCode|CodeBlock|InlineCode|HTMLBlock/;

function inCode(tree, pos) {
  for (let node = tree.resolveInner(pos, 1); node; node = node.parent) {
    if (IN_CODE.test(node.name)) return true;
  }
  return false;
}

// Every task marker in the given document ranges, outside code, as { from, to, checked } in document offsets.
export function findTasks(state, ranges = [{ from: 0, to: state.doc.length }]) {
  // Parse up to the end of what is asked for (a short, bounded wait), so a fence further down is known to be one.
  const end = ranges.reduce((m, r) => Math.max(m, r.to), 0);
  const tree = ensureSyntaxTree(state, end, 50) ?? syntaxTree(state);
  const found = [];
  let last = -1;
  for (const r of ranges) {
    for (let pos = r.from; pos <= r.to; ) {
      const line = state.doc.lineAt(pos);
      pos = line.to + 1;
      if (line.number <= last) continue;
      last = line.number;
      const t = parseTask(line.text);
      if (t && !inCode(tree, line.to - line.text.trimStart().length))
        found.push({ from: line.from + t.from, to: line.from + t.to, checked: t.checked });
    }
  }
  return found;
}

class TaskWidget extends WidgetType {
  constructor(checked) {
    super();
    this.checked = checked;
  }

  eq(other) {
    return other.checked === this.checked;
  }

  toDOM(view) {
    const box = document.createElement("span");
    box.className = "cm-task";
    box.setAttribute("role", "checkbox");
    box.tabIndex = 0;
    box.setAttribute("aria-label", "Task");
    this.sync(box);
    // mousedown is cancelled so the editor keeps its caret and focus; the click does the edit.
    box.addEventListener("mousedown", (e) => e.preventDefault());
    box.addEventListener("click", (e) => {
      e.preventDefault();
      toggleAt(view, box);
    });
    box.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        toggleAt(view, box);
      }
    });
    return box;
  }

  // Reuse the element when only the state changed, so the CSS transition plays.
  updateDOM(dom) {
    this.sync(dom);
    return true;
  }

  sync(box) {
    box.setAttribute("aria-checked", String(this.checked));
    box.classList.toggle("cm-task-done", this.checked);
  }

  ignoreEvent() {
    return true;
  }
}

function toggleAt(view, box) {
  const pos = view.posAtDOM(box);
  const line = view.state.doc.lineAt(pos);
  const t = parseTask(line.text);
  if (!t || line.from + t.from !== pos) return;
  view.dispatch({ changes: toggleChange(line.from + t.from, t.checked), userEvent: "input.task" });
  // The widget is reused, so keyboard focus stays on it.
}

function build(view) {
  const b = new RangeSetBuilder();
  for (const t of findTasks(view.state, view.visibleRanges)) {
    b.add(t.from, t.to, Decoration.replace({ widget: new TaskWidget(t.checked) }));
  }
  return b.finish();
}

// Markdown mode: draw `[ ]` / `[x]` as a checkbox that ticks the source text when clicked (or Space/Enter when focused).
export const taskBoxes = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = build(view);
    }

    update(u) {
      if (u.docChanged || u.viewportChanged || syntaxTree(u.startState) !== syntaxTree(u.state)) this.decorations = build(u.view);
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (p) => EditorView.atomicRanges.of((view) => view.plugin(p)?.decorations ?? Decoration.none),
  },
);
