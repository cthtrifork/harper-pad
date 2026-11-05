<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

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
  // The linked file changed outside the app and the next press replaces it: the one case where the button says something else.
  replacingFile: { type: Boolean, default: false },
  // Save opens the system share sheet (iPhone, iPad): the button says Share and has the share icon.
  sharing: { type: Boolean, default: false },
  showDrawer: { type: Boolean, default: false },
  showProblems: { type: Boolean, default: true },
  problemCount: { type: Number, default: 0 },
  // The open draft: filePath is empty until it has been saved to a file.
  filePath: { type: String, default: "" },
  fileName: { type: String, default: "" },
  fileDir: { type: String, default: "" },
  canSave: { type: Boolean, default: false },
  // Edit / Split / Preview: markdown only. Hidden while the scratch pad is open (only Edit is available then).
  isMarkdown: { type: Boolean, default: false },
  mode: { type: String, default: "edit" },
  // The in-app updater (desktop builds only), rendered at the end of the bar.
  updateButton: { type: [Object, Function], default: null },
  // Autocorrect is on: a small check on the Problems button, so it shows while the panel (with its switch) is closed.
  autocorrect: { type: Boolean, default: false },
});
const emit = defineEmits(["toggle-drawer", "toggle-problems", "save", "view"]);

const mainLabel = computed(() => {
  if (props.replacingFile) return `Replace ${props.fileName}`;
  if (props.syncBusy) return "Syncing...";
  return props.syncOn ? "Sync" : "Save";
});
const mainDisabled = computed(() => !props.canSave || props.syncBusy || (!props.syncOn && !props.needsSave && !props.replacingFile));
// What the button also does when the draft has a file, since the label does not change for it.
const mainTitle = computed(() => (props.filePath && !props.replacingFile ? `Also writes ${props.fileName} if the draft changed` : ""));

const saveMenu = ref(false); // the arrow beside Save: "Save as file..." for a draft that already has a file
const saveSplit = ref(null);

function saveElsewhere() {
  saveMenu.value = false;
  emit("save", true);
}

// A click anywhere else, or Escape, closes the menu.
function onPointerDown(e) {
  if (saveMenu.value && !saveSplit.value?.contains(e.target)) saveMenu.value = false;
}
function onKeydown(e) {
  if (e.key === "Escape") saveMenu.value = false;
}
onMounted(() => {
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <header class="bar">
    <span class="brand">Harper Pad</span>
    <button type="button" class="drawer-btn" :class="{ on: showDrawer }" aria-label="Scratch pad" :aria-expanded="showDrawer" aria-controls="drafts-drawer" @click="emit('toggle-drawer')">
      <svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" /><rect x="2.5" y="2.5" width="3.5" height="11" fill="currentColor" stroke="none" opacity="0.35" /><path d="M6 2.5v11" stroke="currentColor" stroke-width="1.5" /></svg>
      <span class="label">Scratch pad</span> <span class="kbd">Ctrl+J</span>
    </button>
    <span class="sep" aria-hidden="true"></span>
    <!-- One button that only acts. Sync (sync is on) saves the draft, writes its file if it has one and the draft changed, and asks the
         server about it; Save (sync is off) does the first two and is disabled while there is nothing to save. What happened is said by
         the status line in the status bar, not here. The arrow beside it offers choosing a file (or the share sheet on iPhone and iPad). -->
    <span ref="saveSplit" class="split">
      <button type="button" class="tool main" :class="{ replace: replacingFile }" :aria-label="mainLabel" :title="mainTitle" :disabled="mainDisabled" :aria-busy="syncBusy" @click="emit('save', false)">
        <span v-if="syncBusy" class="spin" aria-hidden="true"></span>
        <svg v-else-if="syncOn" class="save-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.5v3h-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <svg v-else class="save-icon" width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5v7M5 7l3 3 3-3M3 12.5h10" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="label">{{ mainLabel }}</span> <span v-if="!replacingFile" class="kbd">Ctrl+S</span>
      </button>
      <button type="button" class="tool arrow" :aria-label="sharing ? 'More ways to save, or share' : 'More ways to save'" aria-haspopup="menu" :aria-expanded="saveMenu" :disabled="!canSave" @click="saveMenu = !saveMenu">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" /></svg>
      </button>
      <Transition name="pop">
        <span v-if="saveMenu" class="menu" role="menu">
          <button type="button" role="menuitem" class="item" @click="saveElsewhere">{{ sharing ? "Share..." : "Save as file..." }} <span class="kbd">Ctrl+Shift+S</span></button>
        </span>
      </Transition>
    </span>
    <span class="sep" aria-hidden="true"></span>
    <template v-if="filePath">
      <span id="file-name" class="file-name">{{ fileName }}</span>
      <span v-if="fileDir" class="mute folder" :title="fileDir">in {{ fileDir }}</span>
    </template>
    <span v-else id="file-badge" class="badge">Draft, not on disk</span>
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
    <button v-if="mode !== 'preview'" type="button" class="toggle" :aria-label="`Problems, ${problemCount}`" :aria-pressed="showProblems" :class="{ on: showProblems }" @click="emit('toggle-problems')">
      <svg class="icon" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><rect x="2.5" y="2.5" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="1.5" /><rect x="10" y="2.5" width="3.5" height="11" fill="currentColor" stroke="none" opacity="0.35" /><path d="M10 2.5v11" stroke="currentColor" stroke-width="1.5" /></svg>
      <span class="label">Problems</span> <span class="count">{{ problemCount }}</span>
      <span v-if="autocorrect" class="mark" role="img" aria-label="Autocorrect is on">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </span>
    </button>
    <span v-if="updateButton" class="sep" aria-hidden="true"></span>
    <component :is="updateButton" v-if="updateButton" />
  </header>
</template>
