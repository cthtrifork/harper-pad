<script setup lang="ts">
// The padlock in the status bar (docs/sync.md, "Protected drafts"), shown only for a protected draft: a click unlocks a locked one and locks an
// unlocked one.
const props = defineProps<{ locked: boolean }>();
const emit = defineEmits<{ toggle: [] }>();

const label = () => (props.locked ? "This draft is locked. Enter the passphrase" : "Protected draft: lock it now");
</script>

<template>
  <button id="lock-btn" type="button" class="lock-btn" :class="locked ? 'locked' : 'unlocked'" :aria-label="label()" :title="label()" @click="emit('toggle')">
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
      <rect x="2.5" y="6" width="9" height="6.5" rx="1.5" stroke="currentColor" stroke-width="1.3" fill="none" />
      <path d="M4.5 6V4.2a2.5 2.5 0 0 1 5 0V6" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round" />
    </svg>
  </button>
</template>
