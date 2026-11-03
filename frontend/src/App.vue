<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import DraftsDrawer from "./components/DraftsDrawer.vue";
import Editor from "./components/Editor.vue";
import Preview from "./components/Preview.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import { keepData } from "./lib/backend.js";
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
// On a phone the problems are a sheet over the text, so they start closed.
const narrow = window.matchMedia("(max-width: 720px)");
const showProblems = ref(!narrow.matches);
const demo = ref(props.start.demo ?? ""); // banner text in demo mode (development builds only); the timings are then fixed
const counts = ref({ words: 0, chars: 0 });
const harper = ref(null);
const personal = ref({ words: [], ignored: [] });
const cursor = ref({ line: 1, col: 1, selected: 0 });
const saveError = ref("");
const editor = ref(null);
const showDrawer = ref(false);
const drafts = useDrafts(editor, showDrawer);
// The text of the open draft. On a first run the editor is empty, except in demo mode (screenshots), which shows a sample.
const initialDoc = drafts.init(props.start, demo.value ? sample : "");

// What the document looks like: Edit (the source only), Split (source and preview side by side) or Preview. Only markdown has a
// preview, and only while the scratch pad is closed: with the drawer open the editor is the only view (the other two are disabled).
const view = ref("edit");
const source = ref(props.start.open?.content ?? (demo.value ? sample : ""));
const paneScroll = ref(0); // how far the source is scrolled, 0 to 1, for the preview to follow
const pane = ref(null);
const hintDismissed = ref(false);
const format = computed(() => drafts.current.value.format);
const isMarkdown = computed(() => format.value === "markdown");
const mode = computed(() => (isMarkdown.value && !showDrawer.value ? view.value : "edit"));
const suggestMarkdown = computed(() => format.value === "text" && !hintDismissed.value && looksLikeMarkdown(source.value));

function setView(id) {
  if (showDrawer.value && id !== "edit") return;
  view.value = id;
  if (id !== "preview") nextTick(() => editor.value?.focus());
}

const chooseFormat = (f) => drafts.setFormat(f);

function onPaneScroll() {
  const el = pane.value;
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  paneScroll.value = max > 0 ? el.scrollTop / max : 0;
}

function toggleDrawer() {
  showDrawer.value = !showDrawer.value;
  if (showDrawer.value) {
    drafts.refreshList();
    if (narrow.matches) showProblems.value = false; // two sheets cannot share a phone screen
  }
}

function toggleProblems() {
  showProblems.value = !showProblems.value;
  if (showProblems.value && narrow.matches && showDrawer.value) toggleDrawer();
}

// Ctrl+J (Cmd+J on a Mac) shows or hides the drafts. Ctrl+S saves: to the draft until the text has been saved to a file, then to
// the file; Ctrl+Shift+S always asks for a file.
function onKeydown(e) {
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

function onResult({ ms }) {
  lintMs.value = ms;
}

// The editor only reports when the findings really changed, so the panel does not re-render per keystroke.
function onProblems(list) {
  problems.value = list;
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
  drafts.attach();
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
  drafts.detach();
});
</script>

<template>
  <div class="app">
    <AppHeader
      :show-drawer="showDrawer"
      :show-problems="showProblems"
      :problem-count="problems.length"
      :file-path="drafts.current.value.filePath"
      :file-name="drafts.fileName.value"
      :file-dir="drafts.fileDir.value"
      :can-save="drafts.available.value"
      :is-markdown="isMarkdown"
      :mode="mode"
      :update-button="UpdateButton"
      @toggle-drawer="toggleDrawer"
      @toggle-problems="toggleProblems"
      @save="drafts.saveFile"
      @view="setView"
    />
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
    <StatusBar
      :state="state"
      :problem-count="problems.length"
      :counts="counts"
      :cursor="cursor"
      :demo="!!demo"
      :setup-ms="setupMs"
      :lint-ms="lintMs"
      :save-error="saveError"
      :draft-status="drafts.status.value"
      :draft-state="drafts.state.value"
      :can-start-fresh="drafts.canStartFresh.value"
      :mode="mode"
      :is-markdown="isMarkdown"
      :suggest-markdown="suggestMarkdown"
      @start-fresh="drafts.startFresh"
      @format="chooseFormat"
      @dismiss-hint="hintDismissed = true"
    />
  </div>
</template>
