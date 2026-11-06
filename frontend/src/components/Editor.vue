<script setup>
import { EditorView } from "@codemirror/view";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { insertSnippet } from "../lib/editor/snippets.js";
import { applyFix, createEditor, fixAllSafe, jumpTo, loadDocument, relint, revertFixes, setMode } from "../lib/editor/index.js";

const props = defineProps({
  harper: { type: Object, default: null },
  doc: { type: String, default: "" },
  format: { type: String, default: "markdown" }, // "markdown" or "text"
  source: { type: Boolean, default: false }, // the Split view's source pane: monospace, line numbers
  persist: { type: Function, default: async () => {} },
  autocorrect: { type: Object, default: () => ({ on: false, typos: true, caps: true, reps: true, spaces: true }) }, // see lib/autocorrect.js
});
const emit = defineEmits(["result", "problems", "stats", "cursor", "edited", "doc", "fixes", "fixed", "user-edit"]);
const host = ref(null);
let view = null;

onMounted(() => {
  host.value.addEventListener("click", keepFocus);
  view = createEditor(host.value, {
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
  () => [props.format, props.source],
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
function topPosition(scroller) {
  if (!view || !scroller || scroller.scrollTop <= 0) return null;
  const { top } = scroller.getBoundingClientRect();
  const { left } = view.contentDOM.getBoundingClientRect();
  return view.posAtCoords({ x: left + 1, y: top + 1 }, false);
}

function scrollToTop(pos) {
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
  load: (text, format = props.format, keepSelection = false) =>
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
  jump: (p) => view && jumpTo(view, p.from, p.to),
  fix: (p, i) => view && applyFix(view, p.from, p.to, i),
  insertSnippet: (trigger, focus = true) => {
    const spec = view && insertSnippet(view.state, trigger);
    if (!spec) return;
    view.dispatch(spec);
    if (focus) view.focus();
  },
  fixAll: () => (view ? fixAllSafe(view) : 0),
  revert: (ids) => (view ? revertFixes(view, ids) : 0),
});
</script>

<template>
  <div ref="host" class="editor"></div>
</template>
