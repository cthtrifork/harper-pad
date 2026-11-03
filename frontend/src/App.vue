<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import AutofixToast from "./components/AutofixToast.vue";
import DraftsDrawer from "./components/DraftsDrawer.vue";
import Editor from "./components/Editor.vue";
import Preview from "./components/Preview.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import { loadPrefs, savePrefs } from "./lib/autocorrect.js";
import { keepData, sharing } from "./lib/backend.js";
import { applySize, loadSize, saveSize, stepSize } from "./lib/fontSize.js";
import { createLinter } from "./lib/harper.js";
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
const narrow = window.matchMedia("(max-width: 720px), (pointer: coarse) and (max-height: 500px)");
const isNarrow = ref(narrow.matches); // reactive copy: Split is not offered on a phone (see below)
const onNarrowChange = (e) => (isNarrow.value = e.matches);
narrow.addEventListener("change", onNarrowChange);
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

// Autocorrect: the user's choices (kept between runs), what it changed and can still take back, and the toast that says so. The toast
// goes away on its own, and at once when the user edits the text themselves.
const autocorrect = ref(loadPrefs());
const fixed = ref([]);
const toast = ref(null); // {ids, tick}: the fixes it is about; a new tick restarts its timer
function setAutocorrect(prefs) {
  autocorrect.value = prefs;
  savePrefs(prefs);
}
function onFixed(ids) {
  toast.value = { ids: [...(toast.value?.ids ?? []), ...ids], tick: (toast.value?.tick ?? 0) + 1 };
}
function undoToast() {
  editor.value?.revert(toast.value?.ids ?? []);
  toast.value = null;
}
// The text of the open draft. On a first run the editor is empty, except in demo mode (screenshots), which shows a sample.
const initialDoc = drafts.init(props.start, demo.value ? sample : "");

// What the document looks like: Edit (the source only), Split (source and preview side by side) or Preview. Only markdown has a
// preview, and only while the scratch pad is closed: with the drawer open the editor is the only view (the other two are disabled).
const view = ref("edit");
const source = ref(props.start.open?.content ?? (demo.value ? sample : ""));
const paneScroll = ref(0); // how far the source is scrolled, 0 to 1, for the preview to follow
const pane = ref(null);

// "Harper ready" and the start-up and check timings are for the first moments, to show Harper has loaded and how long it took. They go
// once the first edit has been saved, and stay away. Where nothing is saved (the database is unavailable) the first edit is the signal.
const startup = ref(true);
const typedRef = ref(false); // nothing is reported as saved until the first edit: a draft that has just opened was saved long ago
let typed = false;
function onEdited() {
  typed = true;
  typedRef.value = true;
  drafts.edited();
  if (!drafts.available.value) startup.value = false;
}
watch(
  () => drafts.state.value,
  (s) => {
    if (s === "saved" && typed) startup.value = false;
  },
);
const format = computed(() => drafts.current.value.format);
const isMarkdown = computed(() => format.value === "markdown");
// Split needs two panes side by side, so a phone shows Edit instead (the header does not offer Split there either); the choice comes
// back when the window is wide again.
const mode = computed(() => {
  if (!isMarkdown.value || showDrawer.value) return "edit";
  return view.value === "split" && isNarrow.value ? "edit" : view.value;
});

function setView(id) {
  if (showDrawer.value && id !== "edit") return;
  // Keep the text that is at the top of the page at the top across Edit <-> Split, which lay it out differently.
  const top = view.value !== "preview" && id !== "preview" ? editor.value?.topPosition(pane.value) : null;
  view.value = id;
  if (id !== "preview") {
    nextTick(() => {
      editor.value?.focus();
      if (top != null) requestAnimationFrame(() => editor.value?.scrollToTop(top));
    });
  }
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

// On a phone the drafts are a full-width sheet over the editor: picking or creating a draft leaves it, so the text (and the
// keyboard that comes with focusing it) is not hidden behind the sheet.
async function pickDraft(action, id) {
  await action(id);
  if (narrow.matches && showDrawer.value) {
    toggleDrawer();
    nextTick(() => editor.value?.focus());
  }
}

function toggleProblems() {
  showProblems.value = !showProblems.value;
  if (showProblems.value && narrow.matches && showDrawer.value) toggleDrawer();
}

// The text size: Ctrl+plus, Ctrl+minus and Ctrl+0 (Cmd on a Mac) step it and reset it. The editor has one, which the Split preview follows;
// the full Preview view has its own, and the keys change that while it is showing. Both are the same on every draft and are kept on this
// device. CodeMirror measures its lines, so it is asked to measure again after the editor's changes.
const textSize = { editor: ref(loadSize("editor")), preview: ref(loadSize("preview")) };
applySize("editor", textSize.editor.value);
applySize("preview", textSize.preview.value);
function resizeText(dir) {
  const which = mode.value === "preview" ? "preview" : "editor";
  const next = stepSize(textSize[which].value, dir);
  if (next === textSize[which].value) return;
  textSize[which].value = next;
  applySize(which, next);
  saveSize(which, next);
  if (which === "editor") editor.value?.remeasure();
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
  } else if (key === "+" || key === "=" || key === "-" || key === "_" || key === "0") {
    e.preventDefault(); // not the webview's own zoom, which would scale the whole window
    resizeText(key === "0" ? 0 : key === "-" || key === "_" ? -1 : 1);
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

// A tap on the empty page beside or below the editor: focus it from the click itself, the only place a phone opens its keyboard.
const focusFromClick = (e) => e.target === pane.value && editor.value?.focusEnd();

onMounted(async () => {
  window.addEventListener("keydown", onKeydown);
  pane.value?.addEventListener("click", focusFromClick);
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
  () => {
    fixed.value = []; // another draft: nothing autocorrect did applies to it
    toast.value = null;
  },
);
onBeforeUnmount(() => {
  narrow.removeEventListener("change", onNarrowChange);
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
      :sharing="sharing"
      :is-markdown="isMarkdown"
      :mode="mode"
      :update-button="UpdateButton"
      :autocorrect="autocorrect.on"
      @toggle-drawer="toggleDrawer"
      @toggle-problems="toggleProblems"
      @save="drafts.saveFile"
      @view="setView"
    />
    <p v-if="demo" id="mode-banner" class="banner">{{ demo }}</p>
    <div class="body" :class="{ 'has-panel': showProblems && mode !== 'preview' }">
      <Transition name="slide-left">
      <DraftsDrawer
        v-if="showDrawer"
        :drafts="drafts.list.value.drafts"
        :total="drafts.list.value.total"
        :current-id="drafts.current.value.id"
        :query="drafts.query.value"
        :toast="drafts.toast.value"
        @open="(id) => pickDraft(drafts.open, id)"
        @create="pickDraft(drafts.create)"
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
            :autocorrect="autocorrect"
            @fixes="fixed = $event"
            @fixed="onFixed"
            @user-edit="toast = null"
            @result="onResult"
            @problems="onProblems"
            @stats="counts = $event"
            @cursor="cursor = $event"
            @doc="source = $event"
            @edited="onEdited"
          />
          <pre v-if="error" class="error">{{ error }}</pre>
        </main>
        </div>
        <Transition name="autofix">
          <AutofixToast v-if="toast" :count="toast.ids.length" :tick="toast.tick" @undo="undoToast" @close="toast = null" />
        </Transition>
        <Transition name="grow">
          <Preview v-if="mode !== 'edit'" class="side" :source="source" :scroll="paneScroll" :follow="mode === 'split'" />
        </Transition>
      </div>
      <Transition name="slide-right">
        <ProblemsPanel v-if="showProblems && mode !== 'preview'" :problems="problems" :words="personal.words" :ignored="personal.ignored" :fixed="fixed" :autocorrect="autocorrect" @autocorrect="setAutocorrect" @fix-all="editor?.fixAll()" @revert="editor?.revert([$event])" @jump="editor?.jump($event)" @fix="(p, i) => editor?.fix(p, i)" @remove-word="removeWord" @remove-ignored="stopIgnoring" />
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
      :draft-status="typedRef || drafts.state.value === 'error' ? drafts.status.value : ''"
      :draft-state="drafts.state.value"
      :can-start-fresh="drafts.canStartFresh.value"
      :mode="mode"
      :is-markdown="isMarkdown"
      :startup="startup"
      :autocorrect="autocorrect.on"
      @toggle-autocorrect="setAutocorrect({ ...autocorrect, on: !autocorrect.on })"
      @start-fresh="drafts.startFresh"
      @format="chooseFormat"
    />
  </div>
</template>
