<script setup>
import "../styles/update-button.css"; // the same look as the desktop update button, loaded with this component
import { onBeforeUnmount, onMounted, ref } from "vue";
import { copyDiagnostics } from "../lib/diagnostics.js";

// The web build's end of the header: the release it was made from (a preview or local build has none and says "dev"), and a popup with
// "Copy diagnostics" for a bug report or a slow start. There is nothing to update here: a reload loads the latest deploy.
const version = import.meta.env.APP_VERSION || "dev";
const open = ref(false);
const root = ref(null);
const copied = ref("");
let copiedTimer = 0;

async function copyReport() {
  copied.value = (await copyDiagnostics(version)) ? "Copied" : "Could not copy";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = ""), 2000);
}
function outside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
function onKey(e) {
  if (e.key === "Escape") open.value = false;
}
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", onKey);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", onKey);
  clearTimeout(copiedTimer);
});
</script>

<template>
  <div ref="root" class="wrap">
    <button type="button" class="btn" :aria-label="`Version ${version}`" :class="{ open }" :aria-expanded="open" aria-haspopup="dialog" @click="open = !open">
      <span class="ver">{{ version }}</span>
      <svg class="info" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" stroke-width="1.5" /><path d="M8 7.2v3.6M8 5v.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
    </button>
    <div v-if="open" class="pop" role="dialog" aria-label="Version">
      <h3>Harper Pad {{ version }}</h3>
      <p>The web app updates itself when it opens online.</p>
      <div class="foot">
        <button type="button" class="link" @click="copyReport">{{ copied || "Copy diagnostics" }}</button>
      </div>
    </div>
  </div>
</template>
