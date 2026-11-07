<script setup lang="ts">
import "../styles/update-button.css"; // the same look as the desktop update button, loaded with this component
import { onBeforeUnmount, onMounted, ref } from "vue";
import { copyDiagnostics } from "../lib/diagnostics.ts";

// The web build's end of the header on a wide window (a phone has the version in the drafts drawer): the release it was made from (a preview or local build has none and says "dev"), and a popup with
// "Copy diagnostics" for a bug report or a slow start. There is nothing to update here: a reload loads the latest deploy.
const version = import.meta.env.APP_VERSION || "dev";
const open = ref(false);
const root = ref<HTMLElement | null>(null);
const copied = ref("");
let copiedTimer: ReturnType<typeof setTimeout> | undefined;

async function copyReport() {
  copied.value = (await copyDiagnostics(version)) ? "Copied" : "Could not copy";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = ""), 2000);
}
function outside(e: Event) {
  if (open.value && root.value && !root.value.contains(e.target as Node)) open.value = false;
}
function onKey(e: KeyboardEvent) {
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
  <div ref="root" class="wrap web-version">
    <button type="button" class="btn" :class="{ open }" :aria-expanded="open" aria-haspopup="dialog" @click="open = !open">{{ version }}</button>
    <Transition name="pop">
      <div v-if="open" class="pop" role="dialog" aria-label="Version">
        <div class="status">
          <div>
            <h3>Harper Pad {{ version }}</h3>
            <p>The web app updates itself when it opens online.</p>
          </div>
        </div>
        <div class="sep"></div>
        <button type="button" class="row" @click="copyReport">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>
          {{ copied || "Copy diagnostics" }}
        </button>
      </div>
    </Transition>
  </div>
</template>
