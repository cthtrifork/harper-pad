<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";
import { createEditor } from "../lib/editor.js";

const props = defineProps({ harper: { type: Object, required: true }, doc: { type: String, default: "" } });
const emit = defineEmits(["result"]);
const host = ref(null);
let view = null;

onMounted(() => {
  view = createEditor(host.value, { doc: props.doc, harper: props.harper, onResult: (r) => emit("result", r) });
  view.focus();
});
onBeforeUnmount(() => view?.destroy());
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
