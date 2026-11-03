<script setup>
import { onBeforeUnmount, ref, watch } from "vue";

// "Fixed 3 things" with Undo, after autocorrect has changed the text. It fades after a few seconds; pointing at it or tabbing into it
// pauses that. The page removes it as soon as the user edits the text themselves, and restarts it (a new `tick`) when more fixes arrive.
const props = defineProps({
  count: { type: Number, required: true },
  tick: { type: Number, default: 0 },
});
const emit = defineEmits(["undo", "close"]);

const SHOW_MS = 6000;
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
  fadeTimer = setTimeout(() => (fading.value = true), SHOW_MS - FADE_MS);
  endTimer = setTimeout(() => emit("close"), SHOW_MS);
}
watch(() => props.tick, start, { immediate: true });
onBeforeUnmount(pause);
</script>

<template>
  <div class="autofix" :class="{ fading }" role="status" @pointerenter="pause" @pointerleave="start" @focusin="pause" @focusout="start">
    <svg class="tick" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span class="msg">Fixed {{ count }} {{ count === 1 ? "thing" : "things" }}</span>
    <button type="button" class="undo" @click="emit('undo')">{{ count === 1 ? "Undo" : "Undo all" }}</button>
  </div>
</template>
