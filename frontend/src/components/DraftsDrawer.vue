<script setup>
import { ref, watch } from "vue";
import { whenLabel } from "../lib/when.js";
import SnippetsHelp from "./SnippetsHelp.vue";

const props = defineProps({
  drafts: { type: Array, required: true },
  total: { type: Number, default: 0 },
  currentId: { type: String, default: "" },
  query: { type: String, default: "" },
  toast: { type: Object, default: null },
});
const emit = defineEmits(["open", "create", "remove", "search", "more", "close", "undo", "snippet"]);

const help = ref(false); // the snippets help page replaces the list
const q = ref(props.query);
watch(
  () => props.query,
  (v) => (q.value = v),
);

// Swipe a draft to the left to delete it (touch only; the delete button and the keyboard still work). It is deleted at once and the
// toast offers Undo, like the button (design cheat sheet: no "Are you sure?"). A vertical move is left to the list's scrolling.
const SWIPE_START = 10; // px before a move counts as a swipe
const SWIPE_DELETE = 96; // px of travel that deletes on release
const dragId = ref("");
const dragX = ref(0);
const settling = ref(false); // after release: the card glides to its end position
let start = null;
let swiped = false; // the click that follows a swipe is not a tap

function swipeDown(e, id) {
  if (e.pointerType !== "touch") return;
  start = { id, x: e.clientX, y: e.clientY, locked: false };
  swiped = false;
}

function swipeMove(e) {
  if (!start) return;
  const dx = e.clientX - start.x;
  if (!start.locked) {
    if (Math.abs(e.clientY - start.y) > SWIPE_START && Math.abs(e.clientY - start.y) > Math.abs(dx)) return void (start = null);
    if (Math.abs(dx) < SWIPE_START) return;
    start.locked = true;
    settling.value = false;
    dragId.value = start.id;
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }
  dragX.value = Math.min(0, dx);
}

function swipeEnd(e) {
  if (!start) return;
  const { id, locked } = start;
  start = null;
  if (!locked) return;
  swiped = true;
  settling.value = true;
  const deleting = e.type !== "pointercancel" && dragX.value <= -SWIPE_DELETE;
  dragX.value = deleting ? -e.currentTarget.offsetWidth : 0; // out of the way, or back where it was
  setTimeout(() => {
    if (deleting) emit("remove", id);
    dragId.value = "";
    dragX.value = 0;
    settling.value = false;
  }, 150);
}

function open(id) {
  if (!swiped) emit("open", id);
  swiped = false;
}

const iso = (ms) => new Date(ms).toISOString();
const baseName = (path) => path.split(/[\\/]/).pop();
</script>

<template>
  <aside id="drafts-drawer" class="drawer" aria-label="Drafts">
    <SnippetsHelp v-if="help" @back="help = false" @insert="(t) => emit('snippet', t)" />
    <template v-else>
    <header>
      <h2>Drafts</h2>
      <div class="actions">
        <button type="button" class="primary" @click="emit('create')">New draft</button>
        <button type="button" class="close" aria-label="Close the drafts list" @click="emit('close')">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /></svg>
        </button>
      </div>
    </header>
    <p class="hint">Kept inside Harper Pad and saved as you type. Nothing is written to your files until you choose Save as file.</p>
    <div class="search">
      <label for="draft-search" class="sr-only">Search drafts</label>
      <input id="draft-search" v-model="q" type="search" placeholder="Search drafts" autocomplete="off" spellcheck="false" @input="emit('search', q)" />
    </div>
    <h3 class="label">{{ query.trim() ? "Results" : "Recent" }}</h3>

    <TransitionGroup v-if="drafts.length" name="draft" tag="ul" class="drafts">
      <li
        v-for="d in drafts"
        :key="d.id"
        class="item"
        :class="{ active: d.id === currentId, dragging: d.id === dragId, settling: d.id === dragId && settling }"
        :style="d.id === dragId ? { '--dx': `${dragX}px` } : undefined"
        @pointerdown="swipeDown($event, d.id)"
        @pointermove="swipeMove"
        @pointerup="swipeEnd"
        @pointercancel="swipeEnd"
      >
        <span class="swipe-bg" aria-hidden="true">Delete</span>
        <button type="button" class="card" :aria-current="d.id === currentId ? 'true' : undefined" @click="open(d.id)">
          <span class="top">
            <span class="title">{{ d.title }}</span>
            <time :datetime="iso(d.updatedAt)">{{ whenLabel(d.updatedAt) }}</time>
          </span>
          <template v-if="d.tasks.length">
            <span class="tasks">
              <span v-for="(t, i) in d.tasks" :key="i" class="task" :class="{ done: t.done }">
                <span class="box" aria-hidden="true">
                  <svg v-if="t.done" width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 5.2l2 2 4-4.4" stroke="currentColor" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
                </span>
                <span class="ttext"><span class="sr-only">{{ t.done ? "Done: " : "To do: " }}</span>{{ t.text }}</span>
              </span>
            </span>
            <span class="progress">{{ d.tasksDone }} of {{ d.tasksTotal }} {{ d.tasksTotal === 1 ? "task" : "tasks" }} done</span>
          </template>
          <span v-else-if="d.excerpt" class="excerpt">{{ d.excerpt }}</span>
          <!-- Only drafts that were saved to a file carry this; the others are just drafts. -->
          <span v-if="d.filePath" class="file" :title="d.filePath">
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 1.5h4l2.5 2.5v6.5H3zM7 1.5V4h2.5" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" fill="none" /></svg>
            <span class="sr-only">Saved to file: </span>{{ baseName(d.filePath) }}
          </span>
        </button>
        <button type="button" class="del" :aria-label="`Delete ${d.title}`" @click="emit('remove', d.id)">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 3.5h7M4.5 3.5V2.5h3v1M3.5 3.5l.4 6h4.2l.4-6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
        </button>
      </li>
    </TransitionGroup>
    <p v-else class="empty">{{ query.trim() ? `No drafts match "${query.trim()}".` : "No drafts yet. Start typing and it is saved here." }}</p>

    <!-- Snippets is a page of its own, so it is a row you can tap, not a word in the footer. -->
    <button type="button" class="snippets-row" @click="help = true">
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M5.5 4L2 8l3.5 4M10.5 4L14 8l-3.5 4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span class="text">
        <span class="name">Snippets</span>
        <span class="about">Type a short code to insert text</span>
      </span>
      <svg class="go" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 1.5l3.5 3.5-3.5 3.5" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round" /></svg>
    </button>

    <footer>
      <span class="mute">{{ total }} {{ total === 1 ? "draft" : "drafts" }}</span>
      <button v-if="total > drafts.length" type="button" class="link" @click="emit('more')">Show more</button>
    </footer>
    </template>

    <Transition name="toast">
      <div v-if="toast" class="toast" role="status">
        <span>{{ toast.message }}</span>
        <button v-if="toast.undo" type="button" class="link strong" @click="emit('undo')">Undo</button>
      </div>
    </Transition>
  </aside>
</template>
