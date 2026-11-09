<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";

// The padlock in the status bar (docs/sync.md, "Protected drafts"): open for a plain draft, closed for a protected one. A click protects a
// plain draft, unlocks a locked one, and opens a small menu on an unlocked one.
const props = defineProps<{ state: "plain" | "locked" | "unlocked" }>();
const emit = defineEmits<{ protect: []; unlock: []; lock: []; "list-title": [] }>();

const open = ref(false);
const root = ref<HTMLElement | null>(null);

function click() {
  if (props.state === "plain") emit("protect");
  else if (props.state === "locked") emit("unlock");
  else open.value = !open.value;
}

function pick(action: () => void) {
  open.value = false;
  action();
}

const outside = (e: Event) => {
  if (open.value && !root.value?.contains(e.target as Node)) open.value = false;
};
const onEscape = (e: KeyboardEvent) => {
  if (e.key === "Escape") open.value = false;
};
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", onEscape);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", onEscape);
});

const label = {
  plain: "Protect this draft with a passphrase",
  locked: "This draft is locked. Enter the passphrase",
  unlocked: "Protected draft: lock options",
};
</script>

<template>
  <span ref="root" class="lock-wrap">
    <button id="lock-btn" type="button" class="lock-btn" :class="state" :aria-label="label[state]" :title="label[state]" :aria-haspopup="state === 'unlocked' ? 'menu' : undefined" :aria-expanded="state === 'unlocked' ? open : undefined" @click="click">
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
        <rect x="2.5" y="6" width="9" height="6.5" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none" />
        <path v-if="state === 'plain'" d="M4.5 6V4.2a2.5 2.5 0 0 1 4.9-.6" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" />
        <path v-else d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" />
      </svg>
    </button>
    <Transition name="pop">
      <div v-if="open" class="menu up lock-menu" role="menu">
        <button type="button" class="item" role="menuitem" @click="pick(() => emit('lock'))">Lock now</button>
        <button type="button" class="item" role="menuitem" @click="pick(() => emit('list-title'))">Change title in the draft list</button>
      </div>
    </Transition>
  </span>
</template>
