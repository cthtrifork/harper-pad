<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";

// A short message with an optional action (Undo, Open copy), floating over the bottom of the page in the toast stack (App.vue). It fades
// after `ms`; pointing at it or tabbing into it pauses that. A new `tick` restarts the timer, for a message that is replaced in place.
// Used for "Fixed 3 things" after autocorrect and for what sync tells the person.
const props = defineProps({
  message: { type: String, required: true },
  action: { type: String, default: "" }, // the label of the one action, or "" for none
  tick: { type: Number, default: 0 },
  ms: { type: Number, default: 6000 },
});
const emit = defineEmits(["action", "close"]);

const FADE_MS = 300;
const fading = ref(false);
let fadeTimer = 0;
let endTimer = 0;

function pause() {
  clearTimeout(fadeTimer);
  clearTimeout(endTimer);
  fading.value = false;
}
function start() {
  pause();
  fadeTimer = setTimeout(() => (fading.value = true), props.ms - FADE_MS);
  endTimer = setTimeout(() => emit("close"), props.ms);
}
watch(() => props.tick, start, { immediate: true });
onBeforeUnmount(pause);
</script>

<template>
  <div class="toast-bar" :class="{ fading }" role="status" @pointerenter="pause" @pointerleave="start" @focusin="pause" @focusout="start">
    <svg class="tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span class="msg">{{ message }}</span>
    <button v-if="action" type="button" class="act" @click="emit('action')">{{ action }}</button>
  </div>
</template>
