<script setup>
import { ref, watch } from "vue";
import { whenLabel } from "../lib/when.js";

const props = defineProps({
  drafts: { type: Array, required: true },
  total: { type: Number, default: 0 },
  currentId: { type: String, default: "" },
  query: { type: String, default: "" },
  toast: { type: Object, default: null },
});
const emit = defineEmits(["open", "create", "remove", "search", "more", "close", "undo"]);

const q = ref(props.query);
watch(
  () => props.query,
  (v) => (q.value = v),
);

const iso = (ms) => new Date(ms).toISOString();
</script>

<template>
  <aside id="drafts-drawer" class="drawer" aria-label="Drafts">
    <header>
      <h2>Drafts</h2>
      <div class="actions">
        <button type="button" class="primary" @click="emit('create')">New draft</button>
        <button type="button" class="close" aria-label="Close the drafts list" @click="emit('close')">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" fill="none" /></svg>
        </button>
      </div>
    </header>
    <p class="hint">Kept inside Harper Pad and saved as you type.</p>
    <div class="search">
      <label for="draft-search" class="sr-only">Search drafts</label>
      <input id="draft-search" v-model="q" type="search" placeholder="Search drafts" autocomplete="off" spellcheck="false" @input="emit('search', q)" />
    </div>
    <h3 class="label">{{ query.trim() ? "Results" : "Recent" }}</h3>

    <ul v-if="drafts.length" class="drafts">
      <li v-for="d in drafts" :key="d.id" class="item" :class="{ active: d.id === currentId }">
        <button type="button" class="card" :aria-current="d.id === currentId ? 'true' : undefined" @click="emit('open', d.id)">
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
        </button>
        <button type="button" class="del" :aria-label="`Delete ${d.title}`" @click="emit('remove', d.id)">
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 3.5h7M4.5 3.5V2.5h3v1M3.5 3.5l.4 6h4.2l.4-6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
        </button>
      </li>
    </ul>
    <p v-else class="empty">{{ query.trim() ? `No drafts match "${query.trim()}".` : "No drafts yet. Start typing and it is saved here." }}</p>

    <footer>
      <span class="mute">{{ total }} {{ total === 1 ? "draft" : "drafts" }}</span>
      <button v-if="total > drafts.length" type="button" class="link" @click="emit('more')">Show more</button>
    </footer>

    <div v-if="toast" class="toast" role="status">
      <span>{{ toast.message }}</span>
      <button v-if="toast.undo" type="button" class="link strong" @click="emit('undo')">Undo</button>
    </div>
  </aside>
</template>

<style scoped>
.drawer {
  position: relative;
  width: 340px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-right: 1px solid var(--line);
  min-height: 0;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 4px;
}
h2 {
  margin: 0;
  font-size: 15px;
}
.actions {
  display: flex;
  gap: 8px;
}
.primary {
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
}
.close {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--text);
}
.hint {
  margin: 0;
  padding: 0 16px 12px;
  color: var(--mute);
  font-size: 12px;
  line-height: 1.45;
}
.search {
  padding: 0 16px 12px;
}
input {
  width: 100%;
  height: 34px;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--bg);
  color: var(--text);
  font: inherit;
  font-size: 13px;
}
.label {
  margin: 0;
  padding: 0 16px 6px;
  color: var(--mute);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.drafts {
  flex: 1;
  min-height: 0;
  overflow: auto;
  list-style: none;
  margin: 0;
  padding: 0 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.item {
  position: relative;
  border-radius: 8px;
  border: 1px solid transparent;
}
.item.active {
  background: var(--raised);
  border-color: var(--line);
}
.item:hover {
  background: var(--raised);
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 12px 7px; /* 8px list inset + 1px border + 7px = the 16px edge of the header and search */
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}
.top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 24px;
  padding-right: 26px; /* room for the delete button */
}
.title {
  font-size: 14px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
time {
  flex: none;
  color: var(--mute);
  font-size: 12px;
}
.tasks {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.task {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  line-height: 1.35;
}
.task.done .ttext {
  color: var(--mute);
  text-decoration: line-through;
}
.box {
  width: 14px;
  height: 14px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid var(--mute);
  border-radius: 3px;
}
.task.done .box {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
.ttext {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.progress {
  color: var(--mute);
  font-size: 12px;
}
.excerpt {
  color: var(--mute);
  font-size: 13px;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.del {
  position: absolute;
  top: 7px;
  right: 7px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--mute);
  opacity: 0;
}
.item:hover .del,
.item:focus-within .del {
  opacity: 1;
}
.del:hover {
  color: var(--bad);
  background: var(--panel);
}
.empty {
  margin: 0;
  padding: 8px 16px;
  color: var(--mute);
  font-size: 13px;
  flex: 1;
}
footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
  font-size: 12px;
}
.mute {
  color: var(--mute);
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-style);
}
.link.strong {
  font-weight: 600;
  color: var(--accent);
}
.toast {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 0 16px 16px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--bg);
  border: 1px solid var(--line);
  font-size: 13px;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
</style>
