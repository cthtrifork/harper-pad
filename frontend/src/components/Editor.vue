<script setup lang="ts">
import { EditorView } from "@codemirror/view";
import { onBeforeUnmount, onMounted, type PropType, ref, watch } from "vue";
import { undo } from "@codemirror/commands";
import type { Prefs } from "../lib/autocorrect.ts";
import type { HarperLinter } from "../lib/harper.ts";
import { insertSnippet } from "../lib/editor/snippets.ts";
import type { PersistNote } from "../lib/editor/lint.ts";
import { applyFix, createEditor, fixAllSafe, jumpTo, loadDocument, relint, replaceExternal, revertFixes, setMode } from "../lib/editor/index.ts";

const props = defineProps({
  harper: { type: Object as PropType<HarperLinter | null>, default: null },
  doc: { type: String, default: "" },
  format: { type: String as PropType<"markdown" | "text">, default: "markdown" },
  source: { type: Boolean, default: false }, // the Split view's source pane: monospace, line numbers
  persist: { type: Function as PropType<(note?: PersistNote) => unknown>, default: async () => {} },
  autocorrect: { type: Object as PropType<Prefs>, default: () => ({ on: false, typos: true, caps: true, reps: true, spaces: true }) }, // see lib/autocorrect.ts
});
const emit = defineEmits(["result", "problems", "stats", "cursor", "edited", "doc", "fixes", "fixed", "user-edit"]);
const host = ref<HTMLElement | null>(null);
let view: EditorView | null = null;

onMounted(() => {
  const el = host.value as HTMLElement;
  el.addEventListener("click", keepFocus);
  view = createEditor(el, {
    doc: props.doc,
    mode: { format: props.format, source: props.source },
    getHarper: () => props.harper,
    onResult: (r) => emit("result", r),
    onProblems: (list) => emit("problems", list),
    persist: (note) => props.persist(note),
    onStats: (counts) => emit("stats", counts),
    onCursor: (c) => emit("cursor", c),
    onDoc: (text) => emit("doc", text),
    onEdit: () => emit("edited"),
    getAutocorrect: () => props.autocorrect,
    onFixes: (list) => emit("fixes", list),
    onFixed: (ids) => emit("fixed", ids),
    onUserEdit: () => emit("user-edit"),
  });
  // Not on a phone: iOS opens the keyboard only for a tap, and a focus without one leaves its bare accessory bar (the arrows and the
  // checkmark) floating over the text. A tap on the page focuses the editor (see keepFocus and App.vue).
  if (!window.matchMedia("(pointer: coarse)").matches) view.focus();
});
// A change to the autocorrect choices changes which findings are safe and whether they are fixed: check again.
watch(
  () => props.autocorrect,
  () => view && relint(view),
  { deep: true },
);
// Harper arrives after the editor: run the first check as soon as it does.
watch(
  () => props.harper,
  () => view && relint(view),
);
watch(
  () => [props.format, props.source] as const,
  ([format, source]) => view && setMode(view, { format, source }),
);
onBeforeUnmount(() => view?.destroy());

// A click on the empty part of the page (below the last line, or beside the column) is not inside CodeMirror's content, so
// it would not focus anything. Treat it as a click into the document: put the caret at the end and focus.
function focusEnd() {
  if (!view) return;
  const end = view.state.doc.length;
  const { anchor, head } = view.state.selection.main;
  // Already a caret at the end: only focus, so the view does not scroll for nothing.
  if (anchor !== end || head !== end) view.dispatch({ selection: { anchor: end }, scrollIntoView: true });
  view.focus();
}

// A tap on a phone opens the keyboard only if the editor is focused while the click is being handled. A tap on the blank part of the
// editor (below the last line, beside the text) can leave it unfocused, so focus it here, at the end of the document.
function keepFocus() {
  if (view && !view.hasFocus) focusEnd();
}

// Edit and Split lay the text out differently (font, line height, width, gutter), so the same pixel scroll offset lands on other
// text. The page remembers which position is at the top of its scroll area before a switch and scrolls it back there after.
function topPosition(scroller: HTMLElement | null | undefined) {
  if (!view || !scroller || scroller.scrollTop <= 0) return null;
  const { top } = scroller.getBoundingClientRect();
  const { left } = view.contentDOM.getBoundingClientRect();
  return view.posAtCoords({ x: left + 1, y: top + 1 }, false);
}

function scrollToTop(pos: number | null | undefined) {
  if (!view) return;
  if (pos == null) return;
  view.dispatch({ effects: EditorView.scrollIntoView(Math.min(pos, view.state.doc.length), { y: "start", yMargin: 0 }) });
}

defineExpose({
  topPosition,
  scrollToTop,
  focusEnd,
  focus: () => view?.focus(),
  remeasure: () => view?.requestMeasure(),
  relint: () => view && relint(view),
  getText: () => view?.state.doc.toString() ?? "",
  load: (text: string, format = props.format, keepSelection = false) =>
    view &&
    loadDocument(
      view,
      text,
      (counts) => emit("stats", counts),
      { format, source: props.source },
      (t) => emit("doc", t),
      (c) => emit("cursor", c),
      keepSelection,
    ),
  // Takes `text` as one edit that Ctrl+Z takes back, changing only what differs: the caret and the scroll position stay as far as the new text
  // allows, and autocorrect does not rewrite it (unlike load, which starts a new document and history).
  replaceText: (text: string) => view && replaceExternal(view, text),
  // True while an IME composition is in progress: replacing the text then would break it.
  composing: () => !!view && (view.composing || view.compositionStarted),
  undo: () => view && undo(view),
  jump: (p: { from: number; to: number }) => view && jumpTo(view, p.from, p.to),
  fix: (p: { from: number; to: number }, i: number) => view && applyFix(view, p.from, p.to, i),
  insertSnippet: (trigger: string, focus = true) => {
    const v = view;
    const spec = v && insertSnippet(v.state, trigger);
    if (!v || !spec) return;
    v.dispatch(spec);
    if (focus) v.focus();
  },
  fixAll: () => (view ? fixAllSafe(view) : 0),
  revert: (ids: number[]) => (view ? revertFixes(view, ids) : 0),
});
</script>

<template>
  <div ref="host" class="editor"></div>
</template>
