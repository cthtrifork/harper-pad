<script setup>
import { onMounted, ref } from "vue";

// A note that was deleted on another device must be kept or removed before the person goes on, so this is a modal dialog: the page behind
// it is inert, and Escape does not close it (the cancel event is stopped). It is the one place the app asks for a choice before it lets the
// person write (docs/design-cheatsheet.html). Keep is the focused, primary choice: it loses nothing.
const emit = defineEmits(["keep", "remove"]);
const dialog = ref(null);
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <dialog ref="dialog" class="gone-dialog" aria-labelledby="gone-title" aria-describedby="gone-text" @cancel.prevent>
    <h2 id="gone-title">Deleted on another device</h2>
    <p id="gone-text">Keep this note, or remove it here too? Removing can be undone for a few seconds.</p>
    <div class="actions">
      <button type="button" class="danger" @click="emit('remove')">Remove</button>
      <button type="button" class="primary" autofocus @click="emit('keep')">Keep</button>
    </div>
  </dialog>
</template>
