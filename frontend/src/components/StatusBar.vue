<script setup>
import { computed, onBeforeUnmount, ref, watch } from "vue";
import SyncChip from "./SyncChip.vue";

const props = defineProps({
  state: { type: String, required: true }, // loading | ready | failed
  problemCount: { type: Number, default: 0 },
  counts: { type: Object, required: true },
  cursor: { type: Object, required: true },
  demo: { type: Boolean, default: false }, // demo mode shows fixed timings so screenshots are the same on every run
  setupMs: { type: Number, default: 0 },
  lintMs: { type: Number, default: 0 },
  saveError: { type: String, default: "" },
  draftStatus: { type: String, default: "" },
  draftState: { type: String, default: "" },
  canStartFresh: { type: Boolean, default: false },
  mode: { type: String, default: "edit" }, // edit | split | preview: the preview has no problems, caret or selection
  isMarkdown: { type: Boolean, default: false },
  startup: { type: Boolean, default: true }, // show "Harper ready" and the start-up and check timings (false after the first edit is saved)
  sync: { type: Object, default: null }, // useSync's result; the chip shows only when sync is set up in this build
  autocorrect: { type: Boolean, default: false }, // autocorrect is on (its switch is in the Problems panel, so it shows here too)
});
// The release the web build was made from, shown small at the bottom right on a phone (the desktop app shows its version in the header).
const version = import.meta.env?.APP_VERSION ?? "";
const emit = defineEmits(["start-fresh", "format", "toggle-autocorrect"]);

// "Harper ready" shows for a few seconds, then gives its place to the format switch.
const READY_MS = 4000;
const readyGone = ref(false);
let readyTimer = null;
watch(
  () => props.state,
  (st) => {
    clearTimeout(readyTimer);
    if (st === "ready") readyTimer = setTimeout(() => (readyGone.value = true), props.demo ? 60 * 60 * 1000 : READY_MS);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(readyTimer));
const showState = computed(() => props.state !== "ready" || (props.startup && !readyGone.value));

const DEMO_SETUP_MS = 1200;
const DEMO_LINT_MS = 20;

// 850 ms -> "850 ms", 1234 ms -> "1.2 s".
function fmt(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
</script>

<template>
  <footer class="status">
    <!-- "Harper ready" and the timings are start-up information: they go once the first edit has been saved (`startup` false). Loading and a
         failure always show, and so does the problem count, which says Harper is working. -->
    <span v-if="showState" :class="['state', state]">{{ state === "loading" ? "Starting Harper, you can already type..." : `Harper ${state}` }}</span>
    <span v-if="state === 'ready' && mode !== 'preview'" class="problems">{{ problemCount }} {{ problemCount === 1 ? "problem" : "problems" }}</span>
    <!-- Autocorrect's state, and a one-click switch for it while the Problems panel (where its card is) is closed. A filled dot is on, a
         hollow one is off, so the state does not depend on colour alone. -->
    <button v-if="state === 'ready' && mode !== 'preview'" id="autocorrect-state" type="button" class="auto-chip" :class="{ on: autocorrect }" role="switch" :aria-checked="autocorrect" aria-label="Autocorrect" @click="emit('toggle-autocorrect')">
      <span class="dot" aria-hidden="true"></span>Autocorrect {{ autocorrect ? "on" : "off" }}
    </button>
    <SyncChip v-if="sync?.configured" :sync="sync" />
    <span id="doc-stats">{{ counts.words }} {{ counts.words === 1 ? "word" : "words" }}<span class="chars">, {{ counts.chars }} {{ counts.chars === 1 ? "char" : "chars" }}</span></span>
    <span v-if="state === 'ready' && startup" class="mute">started in {{ fmt(demo ? DEMO_SETUP_MS : setupMs) }}, last check {{ fmt(demo ? DEMO_LINT_MS : lintMs) }}</span>
    <span v-if="saveError" class="state failed clip" :title="saveError">{{ saveError }}</span>
    <span v-if="draftStatus" id="draft-status" :class="['state', 'clip', draftState === 'error' ? 'failed' : 'mute']" :title="draftStatus">{{ draftStatus }}</span>
    <button v-if="canStartFresh" id="start-fresh" type="button" class="link" title="Moves the unreadable database aside (it is kept, not deleted) and starts a new one" @click="emit('start-fresh')">Start fresh</button>
    <span class="spacer"></span>
    <span v-if="mode !== 'preview'" id="cursor-pos">Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
    <span v-if="cursor.selected && mode !== 'preview'" id="selection">Selection: {{ cursor.selected }} {{ cursor.selected === 1 ? "character" : "characters" }}</span>
    <!-- Two choices, so one small button that shows the current format and switches to the other: no popup to run off the screen. It waits
         until "Harper ready" has gone. M\u2193 is Markdown, Aa is plain text. -->
    <button v-if="!showState" id="format-btn" type="button" class="fmt-btn" :aria-label="isMarkdown ? 'Format: Markdown. Switch to plain text' : 'Format: plain text. Switch to Markdown'" :title="isMarkdown ? 'Markdown (click for plain text)' : 'Plain text (click for Markdown)'" @click="emit('format', isMarkdown ? 'text' : 'markdown')">
      {{ isMarkdown ? "M\u2193" : "Aa" }}
    </button>
    <span v-if="version" id="app-version" class="app-version" title="Version">{{ version }}</span>
  </footer>
</template>
