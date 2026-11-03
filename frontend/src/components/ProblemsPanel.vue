<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  problems: { type: Array, required: true },
  active: { type: Number, default: -1 },
  words: { type: Array, default: () => [] }, // the personal dictionary
  ignored: { type: Array, default: () => [] }, // ignored findings: {hash, label}
});
defineEmits(["jump", "fix", "remove-word", "remove-ignored"]);

const tone = { error: "spelling", warning: "grammar", info: "style" };
// The chips follow the design: the two kinds people meet most, then everything else.
const chips = [
  { id: "all", label: "All" },
  { id: "Spelling", label: "Spelling" },
  { id: "Repetition", label: "Repetition" },
  { id: "other", label: "Other" },
];
const chipOf = (p) => (p.kind === "Spelling" || p.kind === "Repetition" ? p.kind : "other");
const filter = ref("all");
const manage = ref(""); // "", "words" or "ignored": the list of dictionary words or ignored findings shown instead of the problems
const counts = computed(() => {
  const c = { all: props.problems.length, Spelling: 0, Repetition: 0, other: 0 };
  for (const p of props.problems) c[chipOf(p)]++;
  return c;
});
const shown = computed(() => (filter.value === "all" ? props.problems : props.problems.filter((p) => chipOf(p) === filter.value)));
</script>

<template>
  <aside class="panel" aria-label="Problems">
    <template v-if="manage">
      <header>
        <h2>{{ manage === "words" ? "Dictionary" : "Ignored findings" }}</h2>
        <button type="button" class="link" @click="manage = ''">Back to problems</button>
      </header>
      <ul v-if="manage === 'words' && words.length" class="entries">
        <li v-for="w in words" :key="w">
          <code>{{ w }}</code>
          <button type="button" class="remove" :aria-label="`Remove ${w} from the dictionary`" @click="$emit('remove-word', w)">Remove</button>
        </li>
      </ul>
      <ul v-else-if="manage === 'ignored' && ignored.length" class="entries">
        <li v-for="g in ignored" :key="g.hash">
          <span class="label">{{ g.label }}</span>
          <button type="button" class="remove" :aria-label="`Stop ignoring ${g.label}`" @click="$emit('remove-ignored', g.hash)">Stop ignoring</button>
        </li>
      </ul>
      <p v-else class="empty mute">{{ manage === "words" ? "No words added yet." : "No findings ignored." }}</p>
    </template>
    <template v-else>
    <header>
      <h2>Problems</h2>
      <span class="mute">{{ problems.length }} in this document</span>
    </header>
    <div class="chips">
      <button v-for="c in chips" :key="c.id" type="button" class="chip" :class="{ on: filter === c.id }" :aria-pressed="filter === c.id" @click="filter = c.id">
        {{ c.label }} {{ counts[c.id] }}
      </button>
    </div>
    <ul v-if="shown.length">
      <li v-for="(p, i) in shown" :key="`${p.from}-${p.to}-${p.kind}`">
        <button type="button" class="item" @click="$emit('jump', p)">
          <span class="head">
            <span class="dot" :class="tone[p.severity]"></span>
            <span class="kind">{{ p.kind }}</span>
            <code>{{ p.problem }}</code>
          </span>
          <span class="msg">{{ p.message }}</span>
        </button>
        <div v-if="p.fixes.length" class="fixes">
          <button type="button" class="fix" @click="$emit('fix', p, 0)">{{ p.fixes[0] }}</button>
          <span v-if="p.fixes.length > 1" class="mute">+{{ p.fixes.length - 1 }} more</span>
        </div>
      </li>
    </ul>
    <p v-else class="empty mute">{{ problems.length ? "No problems of this kind." : "No problems found." }}</p>
    </template>
    <footer class="foot mute">
      <button type="button" class="link" :aria-pressed="manage === 'words'" @click="manage = manage === 'words' ? '' : 'words'">
        Dictionary: {{ words.length }} {{ words.length === 1 ? "word" : "words" }}
      </button>
      <button type="button" class="link" :aria-pressed="manage === 'ignored'" @click="manage = manage === 'ignored' ? '' : 'ignored'">Ignored: {{ ignored.length }}</button>
    </footer>
  </aside>
</template>

<style scoped>
.panel {
  width: 340px;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--panel);
  border-left: 1px solid var(--line);
  overflow: auto;
}
header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px;
}
h2 {
  margin: 0;
  font-size: 15px;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
li {
  padding: 8px 10px 10px;
  border-radius: 8px;
}
li:hover {
  background: var(--raised);
}
.item {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  text-align: left;
}
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.spelling {
  background: var(--c-spelling);
}
.dot.grammar {
  background: var(--c-grammar);
}
.dot.style {
  background: var(--c-style);
}
.kind {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--mute);
}
code {
  font-family: var(--font-mono);
  font-size: 13px;
}
.msg {
  display: block;
  font-size: 13px;
  line-height: 1.45;
  color: var(--text);
}
.fixes {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 12px;
}
.fix {
  height: 24px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--accent-tint);
  color: var(--text);
  font-size: 12px;
}
.fix:hover {
  border-color: var(--accent);
}
.mute {
  color: var(--mute);
  font-size: 12px;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 16px 12px;
}
/* Filter chips are toggles (design cheat sheet): the chosen one is shown by fill and an accent border, not by border colour alone. */
.chip {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--raised);
  color: var(--text);
  font-size: 12px;
  cursor: pointer;
}
.chip:hover {
  border-color: var(--mute);
}
.chip.on,
.chip.on:hover {
  background: var(--selected);
  border-color: var(--accent);
  box-shadow: inset 0 0 0 1px var(--accent);
}
/* Text links, as in the cheat sheet: --c-style, underlined. */
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-style);
  font: inherit;
  font-size: 12px;
  text-decoration: underline;
  text-underline-offset: 2px;
  cursor: pointer;
}
.foot .link[aria-pressed="true"] {
  font-weight: 600;
}
.entries li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.entries .label {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 13px;
}
/* Destructive: --bad text, border turns --bad on hover, never filled at rest. */
.remove {
  flex: none;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: transparent;
  color: var(--bad);
  font-size: 12px;
  cursor: pointer;
}
.remove:hover {
  border-color: var(--bad);
  background: var(--raised);
}
.empty {
  padding: 0 16px;
}
.foot {
  margin-top: auto;
  display: flex;
  justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--line);
}
</style>
