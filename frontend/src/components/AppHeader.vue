<script setup>
import { onBeforeUnmount, onMounted, ref } from "vue";

const VIEWS = [
  { id: "edit", label: "Edit" },
  { id: "split", label: "Split" },
  { id: "preview", label: "Preview" },
];

defineProps({
  showDrawer: { type: Boolean, default: false },
  showProblems: { type: Boolean, default: true },
  problemCount: { type: Number, default: 0 },
  // The open draft: filePath is empty until it has been saved to a file.
  filePath: { type: String, default: "" },
  fileName: { type: String, default: "" },
  fileDir: { type: String, default: "" },
  canSave: { type: Boolean, default: false },
  // Edit / Split / Preview: markdown only. With the scratch pad open only Edit is available.
  isMarkdown: { type: Boolean, default: false },
  mode: { type: String, default: "edit" },
  // The in-app updater (desktop builds only), rendered at the end of the bar.
  updateButton: { type: [Object, Function], default: null },
});
const emit = defineEmits(["toggle-drawer", "toggle-problems", "save", "view"]);

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
    <button type="button" class="drawer-btn" :class="{ on: showDrawer }" :aria-expanded="showDrawer" aria-controls="drafts-drawer" @click="emit('toggle-drawer')">
      Scratch pad <span class="kbd">Ctrl+J</span>
    </button>
    <span class="sep" aria-hidden="true"></span>
    <!-- One button for the state the draft is in: a draft is saved as a file; a draft with a file is saved to it, and the arrow beside
         it offers saving it somewhere else. -->
    <span v-if="filePath" ref="saveSplit" class="split">
      <button type="button" class="tool main" :disabled="!canSave" @click="emit('save', false)">Save <span class="kbd">Ctrl+S</span></button>
      <button type="button" class="tool arrow" aria-label="More ways to save" aria-haspopup="menu" :aria-expanded="saveMenu" :disabled="!canSave" @click="saveMenu = !saveMenu">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" /></svg>
      </button>
      <Transition name="pop">
        <span v-if="saveMenu" class="menu" role="menu">
          <button type="button" role="menuitem" class="item" @click="saveElsewhere">Save as file... <span class="kbd">Ctrl+Shift+S</span></button>
        </span>
      </Transition>
    </span>
    <button v-else type="button" class="tool" :disabled="!canSave" @click="emit('save', true)">Save as file <span class="kbd">Ctrl+Shift+S</span></button>
    <span class="sep" aria-hidden="true"></span>
    <template v-if="filePath">
      <span id="file-name" class="file-name">{{ fileName }}</span>
      <span v-if="fileDir" class="mute folder" :title="fileDir">in {{ fileDir }}</span>
    </template>
    <span v-else id="file-badge" class="badge">Draft, not on disk</span>
    <span class="spacer"></span>
    <span v-if="isMarkdown" class="sep" aria-hidden="true"></span>
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
        @click="emit('view', v.id)"
      >
        {{ v.label }}
      </button>
    </div>
    <span v-if="isMarkdown && mode !== 'preview'" class="sep" aria-hidden="true"></span>
    <button v-if="mode !== 'preview'" type="button" class="toggle" :aria-pressed="showProblems" :class="{ on: showProblems }" @click="emit('toggle-problems')">
      Problems <span class="count">{{ problemCount }}</span>
    </button>
    <span v-if="updateButton" class="sep" aria-hidden="true"></span>
    <component :is="updateButton" v-if="updateButton" />
  </header>
</template>
