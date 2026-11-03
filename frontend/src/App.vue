<script setup>
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DraftsDrawer from "./components/DraftsDrawer.vue";
import Editor from "./components/Editor.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import { keepData, version } from "./lib/backend.js";
import { createLinter } from "./lib/harper.js";
import { loadPersonal, savePersonal } from "./lib/personal.js";
import { useDrafts } from "./lib/useDrafts.js";

// What main.js asked the backend before mounting (see backend.js startup): the demo banner and the most recent draft.
const props = defineProps({ start: { type: Object, required: true } });

// The in-app updater only exists in the desktop build; the web build loads the latest deploy and carries none of its code.
const UpdateButton = import.meta.env.MODE === "web" ? null : defineAsyncComponent(() => import("./components/UpdateButton.vue"));

const sample = "This are a example of a sentense with with a few mistakes. Harper shuld find them.";
const state = ref("loading");
const error = ref("");
const setupMs = ref(0);
const lintMs = ref(0);
const problems = ref([]);
const showProblems = ref(true);
const goVersion = ref("");
const demo = ref(props.start.demo ?? ""); // banner text in demo mode (development builds only); the timings are then fixed
const counts = ref({ words: 0, chars: 0 });
const harper = ref(null);
const personal = ref({ words: 0, ignored: 0 });
const saveError = ref("");
const editor = ref(null);
const showDrawer = ref(false);
const saveMenu = ref(false); // the arrow beside Save: "Save as file..." for a draft that already has a file
const saveSplit = ref(null);
const drafts = useDrafts(editor, showDrawer);
// The text of the open draft. On a first run the editor is empty, except in demo mode (screenshots), which shows a sample.
const initialDoc = drafts.init(props.start, demo.value ? sample : "");

function saveElsewhere() {
  saveMenu.value = false;
  drafts.saveFile(true);
}

// A click anywhere else closes the menu.
function onPointerDown(e) {
  if (saveMenu.value && !saveSplit.value?.contains(e.target)) saveMenu.value = false;
}

function toggleDrawer() {
  showDrawer.value = !showDrawer.value;
  if (showDrawer.value) drafts.refreshList();
}

// Ctrl+J (Cmd+J on a Mac) shows or hides the drafts. Ctrl+S saves: to the draft until the text has been saved to a file, then to
// the file; Ctrl+Shift+S always asks for a file.
function onKeydown(e) {
  if (e.key === "Escape") saveMenu.value = false;
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "j" && !e.shiftKey) {
    e.preventDefault();
    toggleDrawer();
  } else if (key === "s") {
    e.preventDefault(); // not the browser's "save page"
    drafts.saveFile(e.shiftKey);
  }
}

// Show the editor first, then load Harper: you can type while the wasm loads, and the first check runs as soon as it is ready.
// Harper's 20 MB wasm is fetched after the editor has been painted and not before it, so it never competes with the page for the
// first frame (Lighthouse counts every request in flight before the largest contentful paint against it). The wait is one frame;
// the timer is a fallback for a window that is hidden at start, where the browser does not run animation frames.
const afterNextPaint = () =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, 300);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
const t0 = performance.now();
async function loadHarper() {
  await afterNextPaint();
  const linter = await createLinter();
  // Load the saved dictionary and ignore list into Harper before its first check, so findings already dealt with never show up.
  try {
    personal.value = await loadPersonal(linter);
  } catch (err) {
    saveError.value = `Could not load settings: ${err?.message || err}`;
  }
  return linter;
}

// 850 ms -> "850 ms", 1234 ms -> "1.2 s".
function fmt(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// Demo mode shows these instead of the measured times, so screenshots are the same on every run.
const DEMO_SETUP_MS = 1200;
const DEMO_LINT_MS = 20;

function onResult({ ms }) {
  lintMs.value = ms;
}

// The editor emits on every update; only replace the list when it really changed, so the panel does not re-render per keystroke.
function onProblems(list) {
  if (JSON.stringify(list) !== JSON.stringify(problems.value)) problems.value = list;
}

// Save the dictionary and ignore list after a change. A failure is shown in the status bar; the change still holds for this run.
async function persist() {
  try {
    personal.value = await savePersonal(harper.value);
    saveError.value = "";
  } catch (err) {
    saveError.value = `Could not save settings: ${err?.message || err}`;
  }
}

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  window.addEventListener("pointerdown", onPointerDown);
  drafts.attach();
  version().then(
    (v) => (goVersion.value = v),
    (err) => (goVersion.value = `unavailable: ${err}`),
  );
  keepData();
  await nextTick(); // the editor is in the page now; Harper starts loading after it has been painted
  try {
    harper.value = await loadHarper();
    setupMs.value = Math.round(performance.now() - t0);
    state.value = "ready";
  } catch (err) {
    state.value = "failed";
    error.value = String(err?.stack || err);
  }
});
// The page title follows the design: "notes.md — Harper Pad" for a file, "(draft)" for a draft.
watch(
  () => drafts.fileName.value,
  (name) => {
    document.title = name ? `${name} — Harper Pad` : "Harper Pad";
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  window.removeEventListener("keydown", onKeydown);
  window.removeEventListener("pointerdown", onPointerDown);
  drafts.detach();
});
</script>

<template>
  <div class="app">
    <header class="bar">
      <span class="brand">Harper Pad</span>
      <button type="button" class="drawer-btn" :class="{ on: showDrawer }" :aria-expanded="showDrawer" aria-controls="drafts-drawer" @click="toggleDrawer">
        Scratch pad <span class="kbd">Ctrl+J</span>
      </button>
      <span class="sep" aria-hidden="true"></span>
      <!-- One button for the state the draft is in: a draft is saved as a file; a draft with a file is saved to it, and the arrow beside
           it offers saving it somewhere else. -->
      <span v-if="drafts.current.value.filePath" ref="saveSplit" class="split">
        <button type="button" class="tool main" :disabled="!drafts.available.value" @click="drafts.saveFile(false)">
          Save <span class="kbd">Ctrl+S</span>
        </button>
        <button type="button" class="tool arrow" aria-label="More ways to save" aria-haspopup="menu" :aria-expanded="saveMenu" :disabled="!drafts.available.value" @click="saveMenu = !saveMenu">
          <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" /></svg>
        </button>
        <span v-if="saveMenu" class="menu" role="menu">
          <button type="button" role="menuitem" class="item" @click="saveElsewhere">Save as file... <span class="kbd">Ctrl+Shift+S</span></button>
        </span>
      </span>
      <button v-else type="button" class="tool" :disabled="!drafts.available.value" @click="drafts.saveFile(true)">
        Save as file <span class="kbd">Ctrl+Shift+S</span>
      </button>
      <span class="sep" aria-hidden="true"></span>
      <template v-if="drafts.current.value.filePath">
        <span id="file-name" class="file-name">{{ drafts.fileName.value }}</span>
        <span v-if="drafts.fileDir.value" class="mute folder" :title="drafts.fileDir.value">in {{ drafts.fileDir.value }}</span>
      </template>
      <span v-else id="file-badge" class="badge">Draft, not on disk</span>
      <span class="spacer"></span>
      <button type="button" class="toggle" :aria-pressed="showProblems" :class="{ on: showProblems }" @click="showProblems = !showProblems">
        Problems <span class="count">{{ problems.length }}</span>
      </button>
      <component :is="UpdateButton" v-if="UpdateButton" />
    </header>
    <p v-if="demo" id="mode-banner" class="banner">{{ demo }}</p>
    <div class="body">
      <DraftsDrawer
        v-if="showDrawer"
        :drafts="drafts.list.value.drafts"
        :total="drafts.list.value.total"
        :current-id="drafts.current.value.id"
        :query="drafts.query.value"
        :toast="drafts.toast.value"
        @open="drafts.open"
        @create="drafts.create"
        @remove="drafts.remove"
        @search="drafts.setQuery"
        @more="drafts.showMore"
        @undo="drafts.undo"
        @close="toggleDrawer"
      />
      <main class="page" @mousedown.self.prevent="editor?.focusEnd()">
        <Editor
          ref="editor"
          :harper="harper"
          :doc="initialDoc"
          :persist="persist"
          @result="onResult"
          @problems="onProblems"
          @stats="counts = $event"
          @edited="drafts.edited"
        />
        <pre v-if="error" class="error">{{ error }}</pre>
      </main>
      <ProblemsPanel v-if="showProblems" :problems="problems" :words="personal.words" :ignored="personal.ignored" @jump="editor?.jump($event)" @fix="(p, i) => editor?.fix(p, i)" />
    </div>
    <footer class="status">
      <span :class="['state', state]">{{ state === "loading" ? "Starting Harper, you can already type..." : `Harper ${state}` }}</span>
      <span v-if="state === 'ready'">{{ problems.length }} {{ problems.length === 1 ? "problem" : "problems" }}</span>
      <span id="doc-stats">{{ counts.words }} {{ counts.words === 1 ? "word" : "words" }}, {{ counts.chars }} {{ counts.chars === 1 ? "char" : "chars" }}</span>
      <span v-if="state === 'ready'" class="mute">started in {{ fmt(demo ? DEMO_SETUP_MS : setupMs) }}, last check {{ fmt(demo ? DEMO_LINT_MS : lintMs) }}</span>
      <span v-if="saveError" class="state failed clip" :title="saveError">{{ saveError }}</span>
      <span v-if="drafts.status.value" id="draft-status" :class="['state', 'clip', drafts.state.value === 'error' ? 'failed' : 'mute']" :title="drafts.status.value">{{ drafts.status.value }}</span>
      <button v-if="drafts.canStartFresh.value" id="start-fresh" type="button" class="link" title="Moves the unreadable database aside (it is kept, not deleted) and starts a new one" @click="drafts.startFresh">Start fresh</button>
      <span class="spacer"></span>
      <span class="mute">Version {{ goVersion || "..." }}</span>
    </footer>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.bar {
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.brand {
  font-weight: 600;
}
.spacer {
  flex: 1;
}
.drawer-btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
}
.drawer-btn.on {
  border-color: var(--accent);
}
.kbd {
  color: var(--mute);
  font-size: 12px;
}
.tool {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
}
.split {
  position: relative;
  display: flex;
}
.split .main {
  border-radius: 6px 0 0 6px;
}
.split .arrow {
  width: 28px;
  justify-content: center;
  padding: 0;
  border-left: 0;
  border-radius: 0 6px 6px 0;
}
.menu {
  position: absolute;
  top: 36px;
  left: 0;
  z-index: 10;
  min-width: 100%;
  padding: 4px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--raised);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
}
.menu .item {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 10px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text);
  white-space: nowrap;
}
.menu .item:hover,
.menu .item:focus-visible {
  background: var(--panel);
}
.tool:disabled {
  color: var(--mute);
  cursor: not-allowed;
}
.sep {
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--line);
}
.file-name {
  font-size: 14px;
  font-weight: 500;
}
.folder {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.badge {
  padding: 3px 8px;
  border-radius: 11px;
  background: var(--raised);
  color: var(--mute);
  font-size: 12px;
}
.toggle {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
}
.toggle.on {
  border-color: var(--accent);
}
.count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 600;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.page {
  flex: 1;
  min-width: 0;
  overflow: auto;
  padding: 56px 24px 24px;
}
.status {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 6px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
  font-size: 12px;
}
/* A long message (an SQL error can be) shrinks with an ellipsis, with the full text in the tooltip; everything else keeps its size,
   so the Start fresh link and the version never leave the window. */
.status > :not(.spacer):not(.clip) {
  flex: none;
}
.status > .clip {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.banner {
  flex: none;
  margin: 0;
  padding: 6px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--raised);
  color: var(--text);
  font-size: 12px;
}
.mute {
  color: var(--mute);
}
.state.ready {
  color: var(--ok);
}
.state.failed {
  color: var(--bad);
}
.link {
  font: inherit;
  color: var(--accent, #6aa9ff);
  background: none;
  border: 0;
  padding: 0;
  text-decoration: underline;
  cursor: pointer;
}
.error {
  color: var(--bad);
  white-space: pre-wrap;
}
</style>
