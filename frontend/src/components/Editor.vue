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

defineExpose({
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
  margin: 0 auto;
}
</style>
