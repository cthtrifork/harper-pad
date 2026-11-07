<script setup lang="ts">
import { ref } from "vue";
import { useModalDialog } from "../lib/useModalDialog.ts";

// A note that was deleted on another device must be kept or removed before the person goes on, so this is a modal dialog: the page behind
// it is inert, and Escape does not close it (the cancel event is stopped). It is the one place the app asks for a choice before it lets the
// person write (docs/design-cheatsheet.html). Keep is the focused, primary choice: it loses nothing.
const emit = defineEmits(["keep", "remove"]);
const dialog = ref<HTMLDialogElement | null>(null);
useModalDialog(dialog);
</script>

<template>
  <dialog ref="dialog" class="choice-dialog gone-dialog" aria-labelledby="gone-title" aria-describedby="gone-text" @cancel.prevent>
    <h2 id="gone-title">Deleted on another device</h2>
    <p id="gone-text">Keep this draft, or remove it here too? Removing can be undone for a few seconds.</p>
    <div class="actions">
      <button type="button" class="danger" @click="emit('remove')">Remove</button>
      <button type="button" class="primary" autofocus @click="emit('keep')">Keep</button>
    </div>
  </dialog>
</template>
