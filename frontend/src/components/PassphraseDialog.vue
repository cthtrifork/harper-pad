<script setup lang="ts">
import { computed, ref } from "vue";
import { useModalDialog } from "../lib/useModalDialog.ts";

// Asks for the passphrase of protected drafts (docs/sync.md, "Protected drafts"): a new one for the first protected draft (typed twice), or
// the existing one to protect another draft or to unlock one. Unlike the conflict dialogs it can be cancelled: nothing depends on the answer.
const MIN_LENGTH = 10;

const props = defineProps<{
  mode: "create" | "verify" | "unlock";
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ submit: [passphrase: string]; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
useModalDialog(dialog);

const passphrase = ref("");
const again = ref("");
const mismatch = ref("");

const title = computed(() => (props.mode === "unlock" ? "Unlock this draft" : "Protect this draft"));
const text = computed(() =>
  props.mode === "create"
    ? "Choose a passphrase. It cannot be changed or recovered: lose it and the protected drafts are gone."
    : props.mode === "verify"
      ? "Enter the passphrase of your other protected drafts."
      : "Enter the passphrase of your protected drafts.",
);

function submit() {
  mismatch.value = "";
  if (props.mode === "create") {
    if (passphrase.value.length < MIN_LENGTH) return void (mismatch.value = `Use at least ${MIN_LENGTH} characters.`);
    if (passphrase.value !== again.value) return void (mismatch.value = "The two passphrases differ.");
  } else if (!passphrase.value) return;
  emit("submit", passphrase.value);
}
</script>

<template>
  <dialog ref="dialog" class="choice-dialog pass-dialog" aria-labelledby="pass-title" aria-describedby="pass-text" @cancel.prevent="emit('cancel')">
    <form @submit.prevent="submit">
      <h2 id="pass-title">{{ title }}</h2>
      <p id="pass-text">{{ text }}</p>
      <label for="pass-input">Passphrase</label>
      <input id="pass-input" v-model="passphrase" type="password" autocomplete="off" spellcheck="false" autofocus :disabled="busy" />
      <template v-if="mode === 'create'">
        <label for="pass-again">Repeat passphrase</label>
        <input id="pass-again" v-model="again" type="password" autocomplete="off" spellcheck="false" :disabled="busy" />
      </template>
      <p class="pass-error" role="alert">{{ mismatch || error }}</p>
      <div class="actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary" :disabled="busy">{{ busy ? "Working..." : mode === "unlock" ? "Unlock" : "Protect" }}</button>
      </div>
    </form>
  </dialog>
</template>
