<script setup lang="ts">
import { ref } from "vue";
import { useModalDialog } from "../lib/useModalDialog.ts";

// Asks before a draft is deleted from the drafts list (the x button or a swipe). A modal dialog: the page behind it is inert. Unlike the
// other choice dialogs Escape cancels it, and Cancel is the focused choice, so a stray Enter deletes nothing.
defineProps<{ title: string }>();
const emit = defineEmits(["confirm", "cancel"]);
const dialog = ref<HTMLDialogElement | null>(null);
useModalDialog(dialog);
</script>

<template>
  <dialog ref="dialog" class="choice-dialog gone-dialog" aria-labelledby="confirm-delete-title" aria-describedby="confirm-delete-text" @cancel.prevent="emit('cancel')">
    <h2 id="confirm-delete-title">Delete this draft?</h2>
    <p id="confirm-delete-text">“{{ title }}” will be deleted. You can undo it for a few seconds.</p>
    <div class="actions">
      <button type="button" class="danger" @click="emit('confirm')">Delete</button>
      <button type="button" class="primary" autofocus @click="emit('cancel')">Cancel</button>
    </div>
  </dialog>
</template>
