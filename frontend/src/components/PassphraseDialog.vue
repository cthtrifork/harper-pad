<script setup lang="ts">
import { computed, ref } from "vue";
import { useModalDialog } from "../lib/useModalDialog.ts";

// Asks for the passphrase of protected drafts (docs/sync.md, "Protected drafts"): a new one for the first protected draft (typed twice), or
// the existing one to protect another draft or to unlock one. Unlike the conflict dialogs it can be cancelled: nothing depends on the answer.
const MIN_LENGTH = 10;

const props = defineProps<{
  mode: "create" | "verify" | "unlock" | "title";
  title?: string; // the title the draft list shows now, if any
  busy: boolean;
  error: string;
}>();
const emit = defineEmits<{ submit: [passphrase: string, title: string]; cancel: [] }>();

const dialog = ref<HTMLDialogElement | null>(null);
useModalDialog(dialog);

const passphrase = ref("");
const again = ref("");
const listTitle = ref(props.title ?? "");
const message = computed(() => mismatch.value || props.error);
const asksPassphrase = computed(() => props.mode !== "title");
const asksTitle = computed(() => props.mode !== "unlock");
const mismatch = ref("");

const heading = computed(() => (props.mode === "unlock" ? "Unlock this draft" : props.mode === "title" ? "Title in the draft list" : "Protect this draft"));
const text = computed(() =>
  props.mode === "create"
    ? "Choose a passphrase. It cannot be changed or recovered: lose it and the protected drafts are gone."
    : props.mode === "verify"
      ? "Enter the passphrase of your other protected drafts."
      : props.mode === "title"
        ? "The title is not protected: the draft list and the server show it, and it does not follow the text. Leave it empty for no title."
        : "Enter the passphrase of your protected drafts.",
);

function submit() {
  mismatch.value = "";
  if (props.mode === "create") {
    if (passphrase.value.length < MIN_LENGTH) return void (mismatch.value = `Use at least ${MIN_LENGTH} characters.`);
    if (passphrase.value !== again.value) return void (mismatch.value = "The two passphrases differ. Type them again.");
  } else if (asksPassphrase.value && !passphrase.value) return;
  emit("submit", passphrase.value, listTitle.value);
}
</script>

<template>
  <dialog ref="dialog" class="choice-dialog pass-dialog" aria-labelledby="pass-title" aria-describedby="pass-text" @cancel.prevent="emit('cancel')">
    <form @submit.prevent="submit">
      <h2 id="pass-title">{{ heading }}</h2>
      <p id="pass-text">{{ text }}</p>
      <template v-if="asksTitle">
        <label for="pass-title-input">Title in the draft list</label>
        <input id="pass-title-input" v-model="listTitle" type="text" maxlength="80" placeholder="Locked draft" autocomplete="off" spellcheck="false" :autofocus="mode === 'title'" :disabled="busy" />
      </template>
      <template v-if="asksPassphrase">
        <label for="pass-input">Passphrase</label>
        <input id="pass-input" v-model="passphrase" type="password" :aria-invalid="message ? 'true' : undefined" aria-describedby="pass-error" autocomplete="off" spellcheck="false" :autofocus="mode !== 'title'" :disabled="busy" />
      </template>
      <template v-if="mode === 'create'">
        <label for="pass-again">Repeat passphrase</label>
        <input id="pass-again" v-model="again" type="password" :aria-invalid="message ? 'true' : undefined" aria-describedby="pass-error" autocomplete="off" spellcheck="false" :disabled="busy" />
      </template>
      <p id="pass-error" class="pass-error" role="alert">{{ message }}</p>
      <div class="actions">
        <button type="button" :disabled="busy" @click="emit('cancel')">Cancel</button>
        <button type="submit" class="primary" :class="{ busy }" :disabled="busy">
          <span class="label">{{ mode === "unlock" ? "Unlock" : mode === "title" ? "Save" : "Protect" }}</span>
          <span v-if="busy" class="spin" aria-hidden="true"></span>
        </button>
      </div>
    </form>
  </dialog>
</template>
