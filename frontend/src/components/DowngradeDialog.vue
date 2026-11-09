<script setup lang="ts">
import { ref } from "vue";
import { useModalDialog } from "../lib/useModalDialog.ts";

// A protected draft that came back from the server as plain text: either the protection was removed on another device, or the server took
// it off. Only the person knows, so this is a modal they must answer, like DeletedElsewhereDialog.vue (docs/sync.md, "Protected drafts").
// Keep protected is the focused, primary choice: it loses nothing. Accept plain text is the danger one.
const emit = defineEmits(["keep", "accept"]);
const dialog = ref<HTMLDialogElement | null>(null);
useModalDialog(dialog);
</script>

<template>
  <dialog ref="dialog" class="choice-dialog gone-dialog" aria-labelledby="downgrade-title" aria-describedby="downgrade-text" @cancel.prevent>
    <h2 id="downgrade-title">Protection removed?</h2>
    <p id="downgrade-text">The server now holds this protected draft as plain text. Accept it if you removed the protection on another device. If you did not, keep it protected: the server changed it.</p>
    <div class="actions">
      <button type="button" class="danger" @click="emit('accept')">Accept plain text</button>
      <button type="button" class="primary" autofocus @click="emit('keep')">Keep protected</button>
    </div>
  </dialog>
</template>
