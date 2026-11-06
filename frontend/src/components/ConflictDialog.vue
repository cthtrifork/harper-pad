<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { describeConflict } from "../lib/conflict.js";

// Keep or Overwrite: the one question when the open draft disagrees with its file, the server, or both (docs/sync.md). A modal dialog with no
// way out except a choice: no close button, Escape is stopped (the cancel event), and a click on the backdrop does nothing. The page behind is
// inert, so the text cannot change under it (the autosave keeps storing the draft). Keep is focused and the primary choice: it loses nothing.
// Overwrite is the danger one. The words are `describeConflict`'s: which versions differ and whose text each choice loses.
const props = defineProps({
  model: { type: Object, required: true },
  busy: { type: Boolean, default: false },
  note: { type: String, default: "" },
});
const emit = defineEmits(["choose"]);
const dialog = ref(null);
const text = computed(() => describeConflict(props.model));
// The two explanations start with their choice in bold, so they can be told apart at a glance.
const split = (s, label) => ({ label, rest: s.slice(label.length).trimStart() });
const keep = computed(() => split(text.value.keep, "Keep:"));
const overwrite = computed(() => split(text.value.overwrite, "Overwrite:"));

// Focus goes back where it was (the editor) when the dialog goes away; the page removes it with v-if, which does not close() it.
let before = null;
onMounted(() => {
  before = document.activeElement;
  dialog.value?.showModal();
});
onBeforeUnmount(() => {
  dialog.value?.close();
  if (before?.isConnected) before.focus();
});
</script>

<template>
  <dialog ref="dialog" class="conflict-dialog" role="alertdialog" aria-labelledby="conflict-title" aria-describedby="conflict-text" :aria-busy="busy" @cancel.prevent>
    <h2 id="conflict-title">{{ text.title }}</h2>
    <div id="conflict-text">
      <p>{{ text.detail }}</p>
      <p><strong>{{ keep.label }}</strong> {{ keep.rest }}</p>
      <p><strong>{{ overwrite.label }}</strong> {{ overwrite.rest }}</p>
    </div>
    <p v-if="note" class="note" role="status">{{ note }}</p>
    <div class="actions">
      <button type="button" class="danger" :disabled="busy" @click="emit('choose', 'overwrite')">Overwrite</button>
      <button type="button" class="primary" autofocus :disabled="busy" @click="emit('choose', 'keep')">Keep</button>
    </div>
  </dialog>
</template>
