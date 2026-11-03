<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { applyFix, createEditor, jumpTo, loadDocument, relint, setMode } from "../lib/editor/index.js";

const props = defineProps({
  harper: { type: Object, default: null },
  doc: { type: String, default: "" },
  format: { type: String, default: "markdown" }, // "markdown" or "text"
  source: { type: Boolean, default: false }, // the Split view's source pane: monospace, line numbers
  persist: { type: Function, default: async () => {} },
});
const emit = defineEmits(["result", "problems", "stats", "cursor", "edited", "doc"]);
const host = ref(null);
let view = null;

onMounted(() => {
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
  });
  view.focus();
});
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
  view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
  view.focus();
}

defineExpose({
  focusEnd,
  focus: () => view?.focus(),
  relint: () => view && relint(view),
  getText: () => view?.state.doc.toString() ?? "",
  load: (text, format = props.format) =>
    view &&
    loadDocument(
      view,
      text,
      (counts) => emit("stats", counts),
      { format, source: props.source },
      (t) => emit("doc", t),
      (c) => emit("cursor", c),
    ),
  jump: (p) => view && jumpTo(view, p.from, p.to),
  fix: (p, i) => view && applyFix(view, p.from, p.to, i),
});
</script>

<template>
  <div ref="host" class="editor"></div>
</template>
