<script setup lang="ts">
import { dirtyText, fileControls } from "../lib/fileLink.ts";
import { computed, ref } from "vue";

const VIEWS = [
  { id: "edit", label: "Edit" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Preview" },
];

const props = defineProps({
  // Sync is set up and the device is enrolled: the main button says Sync and always has something to do (it asks the server). Without it
  // the button says Save and is disabled while `needsSave` is false.
  syncOn: { type: Boolean, default: false },
  syncBusy: { type: Boolean, default: false },
  needsSave: { type: Boolean, default: false },
  // Save opens the system share sheet (iPhone, iPad): the button says Share and has the share icon.
  sharing: { type: Boolean, default: false },
  showDrawer: { type: Boolean, default: false },
  showProblems: { type: Boolean, default: true },
  problemCount: { type: Number, default: 0 },
  // Harper is not loaded (opt-in on a phone): the count is a "?", and pressing the button loads Harper.
  harperOff: { type: Boolean, default: false },
  // The open draft: filePath is empty until it has been saved to a file.
  filePath: { type: String, default: "" },
  fileName: { type: String, default: "" },
  fileDir: { type: String, default: "" },
  // Why the file cannot be used right now ("file not found", "permission denied", ...), or "" when it can. The chip is struck through while it is set.
  fileProblem: { type: String, default: "" },
  // The desktop build can unlink a file (the unlink button on the chip). The web build never does: Save to disk is always offered there.
  canUnlink: { type: Boolean, default: false },
  // useDrafts' fileState: "stale" means your draft has changes the file does not have yet (the dot).
  fileState: { type: String, default: "none" },
  // The open draft is a Conflicted copy (in memory only): "Conflicted copy, from the file" and so on, or "".
  copyBadge: { type: String, default: "" },
  canSave: { type: Boolean, default: false },
  // Edit / Split / Preview: markdown only. Hidden while the scratch pad is open (only Edit is available then).
  isMarkdown: { type: Boolean, default: false },
  mode: { type: String, default: "edit" },
  // The in-app updater (desktop) or the version button (web), rendered at the end of the bar.
  updateButton: { type: [Object, Function], default: null },
  // Autocorrect is on: a small check on the Problems button, so it shows while the panel (with its switch) is closed.
  autocorrect: { type: Boolean, default: false },
});
const emit = defineEmits(["toggle-drawer", "toggle-problems", "save", "view", "unlink"]);

const exportLabel = computed(() => (props.sharing ? "Share" : "Save to disk"));
const mainLabel = computed(() => {
  return props.syncOn ? "Sync" : "Save";
});
// The visible label never changes while a sync runs: a longer "Syncing..." moved the buttons beside it on every sync. The turning icon
// shows that it is busy, and the status line says "Syncing...".
const mainName = computed(() => (props.syncBusy ? "Syncing..." : mainLabel.value));
const mainDisabled = computed(() => !props.canSave || props.syncBusy || (!props.syncOn && !props.needsSave));
// What the button also does when the draft has a file, since the label does not change for it.
const controls = computed(() => fileControls({ filePath: props.filePath, fileProblem: props.fileProblem, canUnlink: props.canUnlink, fileState: props.fileState }));
const dirtyText_ = computed(() => (controls.value.showDirty ? dirtyText(props.fileName) : ""));
const problemText = computed(() => (props.fileProblem ? `Not linked: ${props.fileProblem}. Ctrl+S tries again` : ""));
// Hovering the chip always shows the full path, then the reason or the dirty-dot note when there is one.
const chipTitle = computed(() => [props.filePath, problemText.value || dirtyText_.value].filter(Boolean).join("\n"));
const mainTitle = computed(() => (props.filePath ? `Also writes ${props.fileName} if the draft changed` : ""));

// A click turns the sync icon once even when the server answers at once; it keeps turning while the sync is busy.
const turning = ref(false);

// The copy button: the full path goes to the clipboard and the icon is a check for two seconds. A failed copy (no permission) says nothing.
const copied = ref(false);
let copiedTimer = 0;
async function copyPath() {
  try {
    await navigator.clipboard.writeText(props.filePath);
  } catch {
    return;
  }
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = false), 2000);
}
function onMain() {
  turning.value = true;
  emit("save", false);
}
</script>

<template>
  <header class="bar">
    <span class="brand">Harper Pad</span>
    <button type="button" class="drawer-btn" :class="{ on: showDrawer }" aria-label="Scratch pad" title="Scratch pad" :aria-expanded="showDrawer" aria-controls="drafts-drawer" @click="emit('toggle-drawer')">
      <svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" /><rect x="2.5" y="2.5" width="3.5" height="11" fill="currentColor" stroke="none" opacity="0.35" /><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.5" /></svg>
      <span class="label">Scratch pad</span> <span class="kbd">Ctrl+J</span>
    </button>
    <span class="sep" aria-hidden="true"></span>
    <!-- One button that only acts. Sync (sync is on) saves the draft, writes its file if it has one and the draft changed, and asks the
         server about it; Save (sync is off) does the first two and is disabled while there is nothing to save. What happened is said by
         the status line in the status bar, not here. The export button beside it chooses a file (or opens the share sheet on iPhone and iPad). -->
    <span class="actions">
      <button type="button" class="tool main" :aria-label="mainName" :title="mainTitle" :disabled="mainDisabled" :aria-busy="syncBusy" @click="onMain">
        <!-- Sync turns while it works; Save (no sync) is a tray with an arrow going in. Both show at every width: a phone shows only the icon. -->
        <svg v-if="syncOn" class="save-icon sync-icon" :class="{ turn: turning, busy: syncBusy }" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true" @animationend="turning = false"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <svg v-else class="save-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7M5 6.8l3 3 3-3M2.5 10v2.5a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="label">{{ mainLabel }}</span> <span class="kbd">Ctrl+S</span>
      </button>
      <button v-if="controls.showSaveAs" type="button" class="tool export" :aria-label="exportLabel" :title="exportLabel" :disabled="!canSave" @click="emit('save', true)">
        <!-- iPhone and iPad open the share sheet: the share icon. Elsewhere it saves to a file: a disk. -->
        <svg v-if="sharing" class="export-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 10V2.5M5 5l3-3 3 3M3.5 8.5v4h9v-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <svg v-else class="export-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2.5h8.2L13.5 4.8V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V3A.5.5 0 0 1 3 2.5zM5 2.5v3h5v-3M5 13.5V9h6v4.5" stroke="currentColor" stroke-width="1.4" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="label">{{ exportLabel }}</span> <span class="kbd">Ctrl+Shift+S</span>
      </button>
    </span>
    <span v-if="filePath" class="sep" aria-hidden="true"></span>
    <!-- The same chip as the draft badge: the file's name, and its folder in muted type when there is room. -->
    <span v-if="filePath" class="badge on-disk" :class="{ broken: fileProblem }" :title="chipTitle">
      <svg v-if="fileProblem" class="broken-icon" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5l5 9H1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" /><path d="M6 5v2.5M6 9v.1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
      <span id="file-name" class="file-name">{{ fileName }}</span>
      <Transition name="dot"><span v-if="controls.showDirty" class="dirty-dot" aria-hidden="true"></span></Transition>
      <span v-if="controls.showDirty" class="sr-only">{{ dirtyText_ }}</span>
      <span v-if="fileDir" class="folder">in {{ fileDir }}</span>
      <button type="button" class="chip-btn copy-path" :aria-label="copied ? 'Path copied' : `Copy full path of ${fileName}`" :title="copied ? 'Copied' : 'Copy full path'" @click="copyPath">
        <svg v-if="copied" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <svg v-else width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M8 4V2.7A1.2 1.2 0 0 0 6.8 1.5H2.7A1.2 1.2 0 0 0 1.5 2.7v4.100A1.2 1.2 0 0 0 2.7 8H4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
      </button>
      <span v-if="controls.showChipX" class="chip-split" aria-hidden="true"></span>
      <button v-if="controls.showChipX" type="button" class="chip-btn unlink" :aria-label="`Unlink ${fileName}`" :title="`Unlink ${fileName}`" @click="emit('unlink')">
        <!-- the broken link, as in word processors: two link halves with a gap -->
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M5 3.2l.7-.7a2.1 2.1 0 0 1 3 3l-.7.7M7 8.800l-.7.7a2.1 2.1 0 0 1-3-3l.7-.7M2 2l1 1M10 10l-1-1M1.5 4.500h1.200M9.3 7.500h1.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
      </button>
    </span>
    <span v-if="copyBadge" class="badge copy" :title="copyBadge">{{ copyBadge }}</span>
    <span class="sr-only" role="status">{{ problemText || dirtyText_ }}</span>
    <span class="spacer"></span>
    <span v-if="isMarkdown && !showDrawer" class="sep" aria-hidden="true"></span>
    <div v-if="isMarkdown && !showDrawer" class="views" :data-mode="mode" :style="{ '--i': VIEWS.findIndex((v) => v.id === mode) }">
      <span class="thumb" aria-hidden="true"></span>
      <button
        v-for="v in VIEWS"
        :key="v.id"
        type="button"
        class="view"
        :data-view="v.id"
        :class="{ on: mode === v.id }"
        :aria-pressed="mode === v.id"
        @click="emit('view', v.id)"
      >
        {{ v.label }}
      </button>
    </div>
    <span v-if="isMarkdown && !showDrawer && mode !== 'preview'" class="sep" aria-hidden="true"></span>
    <button v-if="mode !== 'preview'" type="button" class="toggle" :aria-label="harperOff ? 'Problems, turn on Harper' : `Problems, ${problemCount}`" :title="harperOff ? 'Turn on Harper to check the text' : 'Problems'" :aria-pressed="showProblems" :class="{ on: showProblems }" @click="emit('toggle-problems')">
      <svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" /><rect x="10" y="2.5" width="3.5" height="11" fill="currentColor" stroke="none" opacity="0.35" /><path d="M10 2.5v11" stroke="currentColor" stroke-width="1.5" /></svg>
      <span class="label">Problems</span> <span class="count">{{ harperOff ? "?" : problemCount }}</span>
      <span v-if="autocorrect" class="mark" role="img" aria-label="Autocorrect is on">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
    </button>
    <span v-if="updateButton" class="sep" aria-hidden="true"></span>
    <component :is="updateButton" v-if="updateButton" />
  </header>
</template>
