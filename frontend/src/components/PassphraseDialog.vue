<script setup lang="ts">
import { computed, ref } from "vue";
import { useModalDialog } from "../lib/useModalDialog.ts";

// Each secure draft has its own passphrase, typed twice on creation. Unlike the conflict dialog, this dialog can be cancelled.
const MIN_LENGTH = 10;

const props = defineProps<{
  mode: "create" | "unlock";
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ submit: [passphrase: string, title: string]; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
useModalDialog(dialog);

const passphrase = ref("");
const again = ref("");
const listTitle = ref("");
const message = computed(() => mismatch.value || props.error);
const asksTitle = computed(() => props.mode !== "unlock");
const mismatch = ref("");

const heading = computed(() => (props.mode === "unlock" ? "Unlock this draft" : "New secure draft"));
const text = computed(() =>
  props.mode === "create"
    ? "Choose a passphrase for this draft. It cannot be changed or recovered: lose it and this draft is gone."
    : "Enter this draft's passphrase.",
);

function submit() {
  mismatch.value = "";
  if (props.mode === "create") {
    if (passphrase.value.length < MIN_LENGTH) return void (mismatch.value = `Use at least ${MIN_LENGTH} characters.`);
    if (passphrase.value !== again.value) return void (mismatch.value = "The two passphrases differ. Type them again.");
  } else if (!passphrase.value) return;
  emit("submit", passphrase.value, listTitle.value);
}
</script>

<template>
  <dialog ref="dialog" class="choice-dialog pass-dialog" aria-labelledby="pass-title" aria-describedby="pass-text" @cancel.prevent="!busy && emit('cancel')">
    <form @submit.prevent="submit">
      <h2 id="pass-title">{{ heading }}</h2>
      <p id="pass-text">{{ text }}</p>
      <template v-if="asksTitle">
        <label for="pass-title-input">Title in the draft list (not protected, optional)</label>
        <input id="pass-title-input" v-model="listTitle" type="text" maxlength="80" placeholder="Locked draft" autocomplete="off" spellcheck="false" :disabled="busy" />
      </template>
      <label for="pass-input">Passphrase</label>
      <input id="pass-input" v-model="passphrase" type="password" :aria-invalid="message ? 'true' : undefined" aria-describedby="pass-error" autocomplete="off" spellcheck="false" autofocus :disabled="busy" />
      <template v-if="mode === 'create'">
        <label for="pass-again">Repeat passphrase</label>
        <input id="pass-again" v-model="again" type="password" :aria-invalid="message ? 'true' : undefined" aria-describedby="pass-error" autocomplete="off" spellcheck="false" :disabled="busy" />
      </template>
      <p id="pass-error" class="pass-error" role="alert">{{ message }}</p>
      <div class="actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary" :class="{ busy }" :disabled="busy">
          <span class="label">{{ mode === "unlock" ? "Unlock" : "Create" }}</span>
          <span v-if="busy" class="spin" aria-hidden="true"></span>
        </button>
      </div>
    </form>
  </dialog>
</template>
