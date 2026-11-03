<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import DraftsDrawer from "./components/DraftsDrawer.vue";
import Editor from "./components/Editor.vue";
import Preview from "./components/Preview.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import { isWeb, keepData, version } from "./lib/backend.js";
import { createLinter } from "./lib/harper.js";
import { looksLikeMarkdown } from "./lib/markdown.js";
import { loadPersonal, noteIgnored, removeIgnored, savePersonal, withoutWord } from "./lib/personal.js";
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
// A release build reports its version number; the web build has none (the footer shows nothing), and a development build (demo mode too) reports "dev".
const versionLabel = computed(() => {
  if (isWeb) return "";
  if (!goVersion.value) return "...";
  return goVersion.value === "dev" ? "Development build" : `Version ${goVersion.value}`;
});
const demo = ref(props.start.demo ?? ""); // banner text in demo mode (development builds only); the timings are then fixed
const counts = ref({ words: 0, chars: 0 });
const harper = ref(null);
const personal = ref({ words: [], ignored: [] });
const cursor = ref({ line: 1, col: 1, selected: 0 });
const saveError = ref("");
const editor = ref(null);
const showDrawer = ref(false);
const saveMenu = ref(false); // the arrow beside Save: "Save as file..." for a draft that already has a file
const saveSplit = ref(null);
const drafts = useDrafts(editor, showDrawer);
// The text of the open draft. On a first run the editor is empty, except in demo mode (screenshots), which shows a sample.
const initialDoc = drafts.init(props.start, demo.value ? sample : "");

// What the document looks like: Edit (the source only), Split (source and preview side by side) or Preview. Only markdown has a
// preview, and only while the scratch pad is closed: with the drawer open the editor is the only view (the other two are disabled).
const view = ref("edit");
const source = ref(props.start.open?.content ?? (demo.value ? sample : ""));
const paneScroll = ref(0); // how far the source is scrolled, 0 to 1, for the preview to follow
const pane = ref(null);
const formatMenu = ref(false);
const formatMenuEl = ref(null);
const hintDismissed = ref(false);
const format = computed(() => drafts.current.value.format);
const isMarkdown = computed(() => format.value === "markdown");
const mode = computed(() => (isMarkdown.value && !showDrawer.value ? view.value : "edit"));
const VIEWS = [
  { id: "edit", label: "Edit" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Preview" },
];
const suggestMarkdown = computed(() => format.value === "text" && !hintDismissed.value && looksLikeMarkdown(source.value));

function setView(id) {
  if (showDrawer.value && id !== "edit") return;
  view.value = id;
  if (id !== "preview") nextTick(() => editor.value?.focus());
}

function chooseFormat(f) {
  formatMenu.value = false;
  drafts.setFormat(f);
}

function onPaneScroll() {
  const el = pane.value;
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  paneScroll.value = max > 0 ? el.scrollTop / max : 0;
}

function saveElsewhere() {
  saveMenu.value = false;
  drafts.saveFile(true);
}

// A click anywhere else closes the menu.
function onPointerDown(e) {
  if (saveMenu.value && !saveSplit.value?.contains(e.target)) saveMenu.value = false;
  if (formatMenu.value && !formatMenuEl.value?.contains(e.target)) formatMenu.value = false;
}

function toggleDrawer() {
  showDrawer.value = !showDrawer.value;
  if (showDrawer.value) drafts.refreshList();
}

// Ctrl+J (Cmd+J on a Mac) shows or hides the drafts. Ctrl+S saves: to the draft until the text has been saved to a file, then to
// the file; Ctrl+Shift+S always asks for a file.
function onKeydown(e) {
  if (e.key === "Escape") {
    saveMenu.value = false;
    formatMenu.value = false;
  }
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
async function persist(note) {
  try {
    if (note?.ignoredHash !== undefined) noteIgnored(note.ignoredHash, note.label);
    personal.value = await savePersonal(harper.value);
    saveError.value = "";
  } catch (err) {
    saveError.value = `Could not save settings: ${err?.message || err}`;
  }
}

// Run a change to Harper's dictionary or ignore list, save it, and check the text again.
async function changePersonal(work) {
  try {
    await work();
    await persist();
    editor.value?.relint();
  } catch (err) {
    saveError.value = `Could not change settings: ${err?.message || err}`;
  }
}

const stopIgnoring = (hash) => changePersonal(() => removeIgnored(harper.value, hash));
// Harper cannot drop a word, so this swaps in a new linter without it; the editor checks again with it when it arrives.
const removeWord = (word) =>
  changePersonal(async () => {
    const old = harper.value;
    harper.value = await withoutWord(old, word, createLinter);
    old.dispose().catch(() => {});
  });

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
watch(
  () => drafts.current.value.id,
  () => (hintDismissed.value = false),
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
        <Transition name="pop">
          <span v-if="saveMenu" class="menu" role="menu">
            <button type="button" role="menuitem" class="item" @click="saveElsewhere">Save as file... <span class="kbd">Ctrl+Shift+S</span></button>
          </span>
        </Transition>
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
      <!-- Edit / Split / Preview: markdown only. With the scratch pad open only Edit is available. -->
      <div v-if="isMarkdown" class="views" :style="{ '--i': VIEWS.findIndex((v) => v.id === mode) }">
        <span class="thumb" aria-hidden="true"></span>
        <button
          v-for="v in VIEWS"
          :key="v.id"
          type="button"
          class="view"
          :class="{ on: mode === v.id }"
          :aria-pressed="mode === v.id"
          :disabled="showDrawer && v.id !== 'edit'"
          :title="showDrawer && v.id !== 'edit' ? 'Close the scratch pad to use this view' : undefined"
          @click="setView(v.id)"
        >
          {{ v.label }}
        </button>
      </div>
      <button v-if="mode !== 'preview'" type="button" class="toggle" :aria-pressed="showProblems" :class="{ on: showProblems }" @click="showProblems = !showProblems">
        Problems <span class="count">{{ problems.length }}</span>
      </button>
      <component :is="UpdateButton" v-if="UpdateButton" />
    </header>
    <p v-if="demo" id="mode-banner" class="banner">{{ demo }}</p>
    <div class="body">
      <Transition name="slide-left">
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
      </Transition>
      <div class="page" :class="mode">
        <div v-show="mode !== 'preview'" class="col">
        <header v-if="mode === 'split'" class="phead">Markdown</header>
        <main ref="pane" class="pane" @mousedown.self.prevent="editor?.focusEnd()" @scroll.passive="onPaneScroll">
          <Editor
            ref="editor"
            :class="{ wide: mode === 'split' }"
            :harper="harper"
            :doc="initialDoc"
            :format="format"
            :source="mode === 'split'"
            :persist="persist"
            @result="onResult"
            @problems="onProblems"
            @stats="counts = $event"
            @cursor="cursor = $event"
            @doc="source = $event"
            @edited="drafts.edited"
          />
          <pre v-if="error" class="error">{{ error }}</pre>
        </main>
        </div>
        <Transition name="grow">
          <Preview v-if="mode !== 'edit'" class="side" :source="source" :scroll="paneScroll" :follow="mode === 'split'" />
        </Transition>
      </div>
      <Transition name="slide-right">
        <ProblemsPanel v-if="showProblems && mode !== 'preview'" :problems="problems" :words="personal.words" :ignored="personal.ignored" @jump="editor?.jump($event)" @fix="(p, i) => editor?.fix(p, i)" @remove-word="removeWord" @remove-ignored="stopIgnoring" />
      </Transition>
    </div>
    <footer class="status">
      <span :class="['state', state]">{{ state === "loading" ? "Starting Harper, you can already type..." : `Harper ${state}` }}</span>
      <span v-if="state === 'ready' && mode !== 'preview'">{{ problems.length }} {{ problems.length === 1 ? "problem" : "problems" }}</span>
      <span id="doc-stats">{{ counts.words }} {{ counts.words === 1 ? "word" : "words" }}, {{ counts.chars }} {{ counts.chars === 1 ? "char" : "chars" }}</span>
      <span v-if="state === 'ready'" class="mute">started in {{ fmt(demo ? DEMO_SETUP_MS : setupMs) }}, last check {{ fmt(demo ? DEMO_LINT_MS : lintMs) }}</span>
      <span v-if="saveError" class="state failed clip" :title="saveError">{{ saveError }}</span>
      <span v-if="drafts.status.value" id="draft-status" :class="['state', 'clip', drafts.state.value === 'error' ? 'failed' : 'mute']" :title="drafts.status.value">{{ drafts.status.value }}</span>
      <button v-if="drafts.canStartFresh.value" id="start-fresh" type="button" class="link" title="Moves the unreadable database aside (it is kept, not deleted) and starts a new one" @click="drafts.startFresh">Start fresh</button>
      <span class="spacer"></span>
      <span v-if="mode !== 'preview'" id="cursor-pos">Ln {{ cursor.line }}, Col {{ cursor.col }}</span>
      <span v-if="cursor.selected && mode !== 'preview'" id="selection">Selection: {{ cursor.selected }} {{ cursor.selected === 1 ? "character" : "characters" }}</span>
      <span v-if="suggestMarkdown" id="markdown-hint" class="mute">
        Looks like Markdown.
        <button type="button" class="link" @click="chooseFormat('markdown')">Switch?</button>
        <button type="button" class="link" aria-label="Dismiss" @click="hintDismissed = true">Not now</button>
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
      <span v-if="versionLabel" class="mute">{{ versionLabel }}</span>
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
/* Toolbar items keep one line; the folder name is the one thing that gives way (it has its own ellipsis). Below 1240 px the shortcut
   hints on the buttons are hidden, so the whole bar still fits the default 1100 px window. */
.bar > :not(.folder, .spacer) {
  flex: none;
  white-space: nowrap;
}
@media (max-width: 1240px) {
  .drawer-btn .kbd,
  .tool .kbd {
    display: none;
  }
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
.drawer-btn:hover {
  border-color: var(--mute);
}
.drawer-btn.on {
  border-color: var(--accent);
  background: var(--selected);
  box-shadow: inset 0 0 0 1px var(--accent);
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
.tool:hover:not(:disabled) {
  border-color: var(--mute);
}
.tool:active:not(:disabled) {
  background: var(--panel);
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
  background: var(--selected);
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
.toggle:hover {
  border-color: var(--mute);
}
.toggle.on {
  border-color: var(--accent);
  background: var(--selected);
  box-shadow: inset 0 0 0 1px var(--accent);
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
  display: flex;
}
.col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.page.split .col {
  border-right: 1px solid var(--line);
}
.phead {
  height: 32px;
  flex: none;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-bottom: 1px solid var(--line);
  color: var(--mute);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
/* The source pane scrolls by itself, so in Split the preview can follow it. */
.pane {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 56px 24px 24px;
}
.page.split .pane {
  padding: 0;
}
.side {
  flex: 1;
  min-width: 0;
}
/* Edit / Split / Preview: a small tray with three equal segments; a raised pill under the current one slides to the view you pick. */
.views {
  position: relative;
  display: grid;
  grid-template-columns: repeat(3, 64px);
  padding: 2px;
  border-radius: 8px;
  background: var(--sunken);
  border: 1px solid var(--line);
}
.thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: 64px;
  border-radius: 6px;
  background: var(--raised);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.12);
  transform: translateX(calc(var(--i, 0) * 100%));
  transition: transform 0.2s var(--ease);
}
.view {
  position: relative;
  height: 26px;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--mute);
  font-size: 13px;
}
.view:hover:not(:disabled) {
  color: var(--text);
}
.view.on {
  color: var(--text);
  font-weight: 600;
}
.view:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Motion (all of it is switched off by prefers-reduced-motion, see styles/index.css). */
.pop-enter-active,
.pop-leave-active {
  transition:
    opacity 0.12s var(--ease),
    transform 0.12s var(--ease);
}
.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.menu.up.pop-enter-from,
.menu.up.pop-leave-to {
  transform: translateY(4px);
}
.slide-left-enter-active,
.slide-left-leave-active,
.slide-right-enter-active,
.slide-right-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.slide-left-enter-from,
.slide-left-leave-to {
  opacity: 0;
  transform: translateX(-24px);
}
.slide-right-enter-from,
.slide-right-leave-to {
  opacity: 0;
  transform: translateX(24px);
}
.grow-enter-active,
.grow-leave-active {
  transition:
    opacity 0.2s var(--ease),
    transform 0.2s var(--ease);
}
.grow-enter-from,
.grow-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
.fmt {
  position: relative;
}
.link.plain {
  color: var(--text);
  text-decoration: none;
}
.menu.up {
  top: auto;
  bottom: 24px;
  left: auto;
  right: 0;
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
