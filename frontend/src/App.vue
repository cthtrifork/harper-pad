<script setup>
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import AppHeader from "./components/AppHeader.vue";
import Editor from "./components/Editor.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import StatusBar from "./components/StatusBar.vue";
import ConflictDialog from "./components/ConflictDialog.vue";
import ToastBar from "./components/ToastBar.vue";
import { loadPrefs, savePrefs } from "./lib/autocorrect.js";
import { isWeb, keepData, settingsSync, sharing, syncDevice, syncDrafts } from "./lib/backend.ts";
import { record } from "./lib/diagnostics.ts";
import { applySize, loadSize, saveSize, stepSize } from "./lib/fontSize.js";
import { createLinter } from "./lib/harper.js";
import { applyIgnored, ignoredHashes, loadPersonal, noteIgnored, removeIgnored, savePersonal, withoutWord, withoutWords } from "./lib/personal.js";
import { statusLine } from "./lib/statusLine.ts";
import { useDrafts } from "./lib/useDrafts.js";
import { COPY_LABELS } from "./lib/conflict.ts";
import { saveAsAction, UNLINK_FIRST } from "./lib/fileLink.ts";
import { useConflict } from "./lib/useConflict.js";
import { useSync } from "./lib/useSync.js";

// What main.js asked the backend before mounting (see backend.ts startup): the demo banner and the most recent draft.
const props = defineProps({ start: { type: Object, required: true } });

// The header's last button, loaded after the first paint. The desktop build has the in-app updater, with its version; the web build loads
// the latest deploy, so its button only shows the version. Both have "Copy diagnostics" (lib/diagnostics.ts).
const UpdateButton = defineAsyncComponent(() =>
  import.meta.env.MODE === "web" ? import("./components/VersionButton.vue") : import("./components/UpdateButton.vue"),
);

// Not on screen at first paint, so out of the first bundle: Preview (with marked and the code highlighter), the drafts drawer and the
// dialog load when they are first shown, which keeps the JavaScript the phone has to fetch and run before the editor appears smaller.
const DeletedElsewhereDialog = defineAsyncComponent(() => import("./components/DeletedElsewhereDialog.vue"));
const DraftsDrawer = defineAsyncComponent(() => import("./components/DraftsDrawer.vue"));
const Preview = defineAsyncComponent(() => import("./components/Preview.vue"));

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
// Syncing the dictionary and ignore list needs Harper, which loads after the first paint: they wait for it (or for its failure).
let harperLoaded;
const harperReady = new Promise((resolve) => {
  harperLoaded = resolve;
});
const linter = async () => {
  await harperReady;
  if (!harper.value) throw new Error("Harper did not load");
  return harper.value;
};
const personal = ref({ words: [], ignored: [] });
const cursor = ref({ line: 1, col: 1, selected: 0 });
const saveError = ref("");
const editor = ref(null);
const showDrawer = ref(false);
// Sync all saves what is typed first, leaves the draft that is open alone (a download must not change text being typed), and refreshes the
// list when it changed local drafts. `drafts` is created next; these run later, so it exists by then.
const sync = useSync({
  origin: import.meta.env?.SYNC_ORIGIN ?? "",
  deviceStore: syncDevice,
  drafts: syncDrafts,
  prepare: () => drafts.flush(),
  skip: () => new Set([drafts.current.value.id].filter(Boolean)),
  onChanged: () => drafts.refreshList(),
  onRemoved: (draft) => drafts.removedElsewhere(draft),
  onRestore: (draft) => drafts.restore(draft),
  settings: {
    current: async () => {
      const h = await linter();
      return { words: await h.exportWords(), ignored: await ignoredHashes(h) };
    },
    store: settingsSync,
    apply: (changes) => applySettings(changes),
  },
  isOpen: (id) => drafts.current.value.id === id,
});
// A draft that was opened is checked against the server in the background (a newer version is swapped in when nothing was typed).
const openHooks = { canSwap: () => drafts.canReplace(), onSwapped: () => drafts.reloadCurrent() };
const checkOpened = (id) => sync.noteOpened(id, openHooks);
// An autosave pushes after a short wait; Save (or Ctrl+S, also to a file) pushes at once and settles the open draft.
const drafts = useDrafts(editor, showDrawer, {
  onSaved: (id, how) => (how?.explicit ? sync.syncRequested(id, openHooks) : sync.draftSaved(id)),
  onOpened: checkOpened,
  onDeleted: sync.draftDeleted,
  probeServer: (id) => sync.probeServer(id),
});
// Keep or Overwrite for the open draft, when it disagrees with its file, the server, or both.
const conflict = useConflict({ drafts, sync });
const copyBadge = computed(() => COPY_LABELS[drafts.copies.value[drafts.current.value.id]] ?? "");

// The status line: where the open draft's text is and who has it, joined from the draft and the sync (lib/statusLine.ts).
const statusLineNow = computed(() =>
  statusLine({
    draft: { state: drafts.state.value, text: drafts.status.value, fileState: drafts.fileState.value, fileName: drafts.fileName.value, recreated: drafts.recreated.value },
    sync: {
      enrolled: sync.enrolled.value,
      status: sync.status.value,
      newer: sync.notice.value?.kind === "newer",
      rejected: sync.rejected.value?.id === drafts.current.value.id ? sync.rejected.value : null,
    },
  }),
);
// The button only acts: Sync when sync is on, Save when it is off (disabled while there is nothing to save).
const syncBusy = computed(() => sync.status.value === "syncing");
// A draft that has just opened says nothing about saving until something is typed; pressing Sync or Save asks for an answer, so it shows.
const syncAsked = ref(false);
// A linked draft cannot be saved as another file until it is unlinked (the unlink button on the file chip); Ctrl+Shift+S only says so in the status line.
const saveAsHint = ref("");
let saveAsHintTimer = 0;
watch(
  () => drafts.current.value.filePath,
  () => (saveAsHint.value = ""), // the link changed (unlinked, or another draft): the hint is stale
);
function onSave(saveAs = false) {
  if (saveAs && saveAsAction({ filePath: drafts.current.value.filePath, fileProblem: drafts.fileProblem.value, canUnlink: !isWeb }) === "hint") {
    saveAsHint.value = UNLINK_FIRST;
    clearTimeout(saveAsHintTimer);
    saveAsHintTimer = setTimeout(() => (saveAsHint.value = ""), 5000);
    return Promise.resolve();
  }
  syncAsked.value = true;
  return drafts.saveFile(saveAs);
}
watch(
  () => drafts.current.value.id,
  () => (syncAsked.value = false),
);

// What sync tells the person in a toast. "Newer on the server" is not one: it stays beside the chip until a save or Sync all settles it.
const syncToast = computed(() => {
  const n = sync.notice.value;
  if (!n || n.kind === "newer") return null;
  return { ...n, action: n.kind === "removed" ? "Undo" : "", ms: n.kind === "updated" ? 5000 : 12000 };
});
function syncToastAction() {
  const n = sync.notice.value;
  if (n?.kind === "removed") sync.undoRemoved();
}

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

// The help page's shortcut: the snippet goes in at the cursor and the drawer stays open, so several can be inserted in a row. On a
// phone the editor is not focused either: that would open the keyboard over the list.
function insertSnippet(trigger) {
  editor.value?.insertSnippet(trigger, !narrow.matches);
}

// A new draft always leaves the drawer (you are about to write in it). Opening another draft leaves it on a phone only, where the
// drafts are a full-width sheet over the editor and would hide the text (and the keyboard that comes with focusing it); on a wide
// screen the drawer stays open beside the editor.
async function pickDraft(action, id, { always = false } = {}) {
  await action(id);
  if ((always || narrow.matches) && showDrawer.value) {
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

// Ctrl+J (Cmd+J on a Mac) shows or hides the drafts. Ctrl+S is Sync (Save when sync is off): it saves the draft, writes its file if it
// has one and the draft changed, and asks the server about it; Ctrl+Shift+S always asks for a file.
function onKeydown(e) {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === "j" && !e.shiftKey) {
    e.preventDefault();
    toggleDrawer();
  } else if (key === "s") {
    e.preventDefault(); // not the browser's "save page"
    onSave(e.shiftKey);
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
    sync.wordsChanged();
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

// What syncing the dictionary and ignore list decided (docs/sync.md, "Settings"): they become the server's. Words the server lacks are
// removed with a new linter (Harper cannot drop one), the others imported; hashes likewise.
const applySettings = ({ words, ignored }) =>
  changePersonal(async () => {
    if (words.remove.length) {
      const old = harper.value;
      harper.value = await withoutWords(old, words.remove, createLinter);
      old.dispose().catch(() => {});
    }
    if (words.add.length) await harper.value.importWords(words.add);
    await applyIgnored(harper.value, ignored);
  });

const stopIgnoring = (hash) => changePersonal(() => removeIgnored(harper.value, hash));
// Harper cannot drop a word, so this swaps in a new linter without it; the editor checks again with it when it arrives.
const removeWord = (word) =>
  changePersonal(async () => {
    const old = harper.value;
    harper.value = await withoutWord(old, word, createLinter);
    old.dispose().catch(() => {});
  });

// A tap on the empty page beside or below the editor: focus it from the click itself, the only place a phone opens its keyboard.
// A drag that starts in the text and is let go over the blank page also fires a click on the pane (their common ancestor). That is a
// selection, not a tap: only a press that began on the blank page too counts, or the selection collapses and the caret jumps to the end.
// Only a plain press counts: a right or middle button, or a held Ctrl, Shift, Alt or Meta, means something else (a menu, a paste, an
// extended selection) and must not move the caret.
const isPlainPress = (e) => e.button === 0 && !(e.ctrlKey || e.shiftKey || e.altKey || e.metaKey);
let pressedOnBlank = false;
const notePress = (e) => {
  pressedOnBlank = e.target === pane.value && isPlainPress(e);
};
const focusFromClick = (e) => {
  const tap = pressedOnBlank && e.target === pane.value;
  pressedOnBlank = false;
  if (tap) editor.value?.focusEnd();
};
const focusFromPress = (e) => {
  if (isPlainPress(e)) editor.value?.focusEnd();
};

onMounted(async () => {
  // A device that cannot be read just shows "Sync off". The draft open at start is checked once the device is known.
  // The linked file is looked at first and the server after it, so a clean draft is not changed by a pull before the file is seen.
  let fileReady = Promise.resolve();
  sync
    .init()
    .then(() => fileReady)
    .then(() => drafts.current.value.id && checkOpened(drafts.current.value.id))
    .catch(() => {});
  window.addEventListener("keydown", onKeydown);
  pane.value?.addEventListener("pointerdown", notePress);
  pane.value?.addEventListener("click", focusFromClick);
  drafts.attach();
  keepData();
  await nextTick(); // the editor is in the page now; Harper starts loading after it has been painted
  fileReady = drafts.checkFile(); // the draft open at start: its linked file may have changed while the app was closed
  try {
    harper.value = await loadHarper();
    setupMs.value = Math.round(performance.now() - t0);
    record("setupMs", setupMs.value);
    state.value = "ready";
  } catch (err) {
    state.value = "failed";
    error.value = String(err?.stack || err);
  } finally {
    harperLoaded();
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
      :file-problem="drafts.fileProblem.value"
      :can-unlink="!isWeb"
      :file-state="drafts.fileState.value"
      :copy-badge="copyBadge"
      @unlink="drafts.unlinkFile"
      :can-save="drafts.available.value"
      :sync-on="sync.enrolled.value"
      :sync-busy="syncBusy"
      :needs-save="drafts.needsSave.value"
      :sharing="sharing"
      :is-markdown="isMarkdown"
      :mode="mode"
      :update-button="UpdateButton"
      :autocorrect="autocorrect.on"
      @toggle-drawer="toggleDrawer"
      @toggle-problems="toggleProblems"
      @save="onSave"
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
        :copies="drafts.copies.value"
        @dismiss-copy="drafts.dropCopy"
        @open="(id) => pickDraft(drafts.open, id)"
        @create="pickDraft(drafts.create, undefined, { always: true })"
        @remove="drafts.remove"
        @search="drafts.setQuery"
        @more="drafts.showMore"
        @undo="drafts.undo"
        @snippet="insertSnippet"
        @close="toggleDrawer"
      />
      </Transition>
      <div class="page" :class="mode">
        <div v-show="mode !== 'preview'" class="col">
        <header v-if="mode === 'split'" class="phead">Markdown</header>
        <main ref="pane" class="pane" @mousedown.self.prevent="focusFromPress" @scroll.passive="onPaneScroll">
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
        <div class="toast-stack">
          <Transition name="toast-bar">
            <ToastBar v-if="toast" :message="`Fixed ${toast.ids.length} ${toast.ids.length === 1 ? 'thing' : 'things'}`" :action="toast.ids.length === 1 ? 'Undo' : 'Undo all'" :tick="toast.tick" @action="undoToast" @close="toast = null" />
          </Transition>
          <Transition name="toast-bar">
            <ToastBar v-if="drafts.refreshed.value" :message="`Updated from ${drafts.refreshed.value.name}`" action="Undo" :tick="drafts.refreshed.value.tick" @action="drafts.undoRefresh" @close="drafts.refreshed.value = null" />
          </Transition>
          <Transition name="toast-bar">
            <ToastBar v-if="drafts.unlinkedToast.value" :message="`Unlinked ${drafts.unlinkedToast.value.name}`" action="Undo" :tick="drafts.unlinkedToast.value.tick" @action="drafts.undoUnlink" @close="drafts.unlinkedToast.value = null" />
          </Transition>
          <Transition name="toast-bar">
            <ToastBar v-if="drafts.linkMoved.value" :message="drafts.linkMoved.value.text" :tick="drafts.linkMoved.value.tick" :ms="9000" @close="drafts.linkMoved.value = null" />
          </Transition>
          <Transition name="toast-bar">
            <ToastBar v-if="syncToast" :message="syncToast.text" :action="syncToast.action" :tick="syncToast.at" :ms="syncToast.ms" @action="syncToastAction" @close="sync.clearNotice()" />
          </Transition>
        </div>
        <Transition name="grow">
          <Preview v-if="mode !== 'edit'" class="side" :source="source" :scroll="paneScroll" :follow="mode === 'split'" />
        </Transition>
      </div>
      <Transition name="slide-right">
        <ProblemsPanel v-if="showProblems && mode !== 'preview'" :problems="problems" :words="personal.words" :ignored="personal.ignored" :fixed="fixed" :autocorrect="autocorrect" @autocorrect="setAutocorrect" @fix-all="editor?.fixAll()" @revert="editor?.revert([$event])" @jump="editor?.jump($event)" @fix="(p, i) => editor?.fix(p, i)" @remove-word="removeWord" @remove-ignored="stopIgnoring" />
      </Transition>
    </div>
    <!-- A note that was deleted on another device: a modal, so the person has to choose Keep or Remove. -->
    <ConflictDialog v-if="conflict.model.value" :model="conflict.model.value" :busy="conflict.busy.value" :note="conflict.note.value" @choose="conflict.choose" />
    <DeletedElsewhereDialog v-if="sync.gone.value && !conflict.model.value" @keep="sync.keepGone()" @remove="sync.removeGone()" />
    <StatusBar
      :state="state"
      :problem-count="problems.length"
      :counts="counts"
      :cursor="cursor"
      :demo="!!demo"
      :setup-ms="setupMs"
      :lint-ms="lintMs"
      :save-error="saveError"
      :draft-status="saveAsHint || (typedRef || syncAsked || drafts.state.value === 'error' || sync.notice.value?.kind === 'newer' || sync.rejected.value?.id === drafts.current.value.id ? statusLineNow.text : '')"
      :draft-tone="saveAsHint ? 'mute' : statusLineNow.tone"
      :draft-state="drafts.state.value"
      :can-start-fresh="drafts.canStartFresh.value"
      :mode="mode"
      :is-markdown="isMarkdown"
      :startup="startup"
      :autocorrect="autocorrect.on"
      @toggle-autocorrect="setAutocorrect({ ...autocorrect, on: !autocorrect.on })"
      :sync="sync"
      @start-fresh="drafts.startFresh"
      @format="chooseFormat"
    />
  </div>
</template>
