<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

defineProps({
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
  suggestMarkdown: { type: Boolean, default: false }, // a plain text draft that looks like Markdown
});
const emit = defineEmits(["start-fresh", "format", "dismiss-hint"]);

const formatMenu = ref(false);
const formatMenuEl = ref(null);
function chooseFormat(f) {
  formatMenu.value = false;
  emit("format", f);
}
// A click anywhere else, or Escape, closes the menu.
function onPointerDown(e) {
  if (formatMenu.value && !formatMenuEl.value?.contains(e.target)) formatMenu.value = false;
}
function onKeydown(e) {
  if (e.key === "Escape") formatMenu.value = false;
}
onMounted(() => {
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("keydown", onKeydown);
});

const DEMO_SETUP_MS = 1200;
const DEMO_LINT_MS = 20;

// 850 ms -> "850 ms", 1234 ms -> "1.2 s".
function fmt(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}
</script>

<template>
  <footer class="status">
    <span :class="['state', state]">{{ state === "loading" ? "Starting Harper, you can already type..." : `Harper ${state}` }}</span>
    <span v-if="state === 'ready' && mode !== 'preview'">{{ problemCount }} {{ problemCount === 1 ? "problem" : "problems" }}</span>
    <span id="doc-stats">{{ counts.words }} {{ counts.words === 1 ? "word" : "words" }}, {{ counts.chars }} {{ counts.chars === 1 ? "char" : "chars" }}</span>
    <span v-if="state === 'ready'" class="mute">started in {{ fmt(demo ? DEMO_SETUP_MS : setupMs) }}, last check {{ fmt(demo ? DEMO_LINT_MS : lintMs) }}</span>
    <span v-if="saveError" class="state failed clip" :title="saveError">{{ saveError }}</span>
    <span v-if="draftStatus" id="draft-status" :class="['state', 'clip', draftState === 'error' ? 'failed' : 'mute']" :title="draftStatus">{{ draftStatus }}</span>
    <button v-if="canStartFresh" id="start-fresh" type="button" class="link" title="Moves the unreadable database aside (it is kept, not deleted) and starts a new one" @click="emit('start-fresh')">Start fresh</button>
    <span class="spacer"></span>
    <span v-if="mode !== 'preview'" id="cursor-pos">Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
    <span v-if="cursor.selected && mode !== 'preview'" id="selection">Selection: {{ cursor.selected }} {{ cursor.selected === 1 ? "character" : "characters" }}</span>
    <span v-if="suggestMarkdown" id="markdown-hint" class="mute">
      Looks like Markdown.
      <button type="button" class="link" @click="chooseFormat('markdown')">Switch?</button>
      <button type="button" class="link" aria-label="Dismiss" @click="emit('dismiss-hint')">Not now</button>
    </span>
    <span ref="formatMenuEl" class="fmt">
      <button id="format-btn" type="button" class="link plain" aria-haspopup="menu" :aria-expanded="formatMenu" @click="formatMenu = !formatMenu">
        {{ isMarkdown ? "Markdown" : "Plain text" }} <span aria-hidden="true">&#9662;</span>
      </button>
      <Transition name="pop">
        <span v-if="formatMenu" class="menu up" role="menu">
          <button type="button" role="menuitemradio" :aria-checked="isMarkdown" class="item" @click="chooseFormat('markdown')">Markdown <span aria-hidden="true">{{ isMarkdown ? "\u2713" : "" }}</span></button>
          <button type="button" role="menuitemradio" :aria-checked="!isMarkdown" class="item" @click="chooseFormat('text')">Plain text <span aria-hidden="true">{{ isMarkdown ? "" : "\u2713" }}</span></button>
        </span>
      </Transition>
    </span>
  </footer>
</template>
