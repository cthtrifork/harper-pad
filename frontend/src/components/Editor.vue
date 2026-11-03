<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { applyFix, createEditor, jumpTo } from "../lib/editor.js";

const props = defineProps({ harper: { type: Object, required: true }, doc: { type: String, default: "" } });
const emit = defineEmits(["result", "problems"]);
const host = ref(null);
let view = null;

onMounted(() => {
  view = createEditor(host.value, {
    doc: props.doc,
    harper: props.harper,
    onResult: (r) => emit("result", r),
    onProblems: (list) => emit("problems", list),
  });
  view.focus();
});
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
  jump: (p) => view && jumpTo(view, p.from, p.to),
  fix: (p, i) => view && applyFix(view, p.from, p.to, i),
});
</script>

<template>
  <div ref="host" class="editor"></div>
</template>

<style scoped>
.editor {
  max-width: 720px;
  min-height: 100%;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}
.editor :deep(.cm-editor) {
  flex: 1;
}
.editor :deep(.cm-scroller) {
  min-height: 60vh;
}
.editor :deep(.cm-content) {
  min-height: 60vh;
}
</style>
