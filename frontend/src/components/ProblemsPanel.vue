<script setup>
import { computed, ref } from "vue";

const props = defineProps({
  problems: { type: Array, required: true },
  active: { type: Number, default: -1 },
  words: { type: Array, default: () => [] }, // the personal dictionary
  ignored: { type: Array, default: () => [] }, // ignored findings: {hash, label}
  fixed: { type: Array, default: () => [] }, // what autocorrect changed and can still take back: {id, original, replacement}
});
defineEmits(["jump", "fix", "remove-word", "remove-ignored", "fix-all", "revert"]);

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
const safeCount = computed(() => props.problems.filter((p) => p.safe).length);
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
    <button v-if="safeCount" type="button" class="fix-all" @click="$emit('fix-all')">Fix all safe issues ({{ safeCount }})</button>
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
    <section v-if="fixed.length" class="recent" aria-label="Recently fixed">
      <h3>Recently fixed <span>{{ fixed.length }}</span></h3>
      <ul>
        <li v-for="f in fixed" :key="f.id">
          <code>{{ f.original }} → {{ f.replacement || "(removed)" }}</code>
          <button type="button" class="undo" :aria-label="`Undo ${f.original} to ${f.replacement}`" @click="$emit('revert', f.id)">Undo</button>
        </li>
      </ul>
    </section>
    </template>
    <footer class="foot mute">
      <button type="button" class="link" :aria-pressed="manage === 'words'" @click="manage = manage === 'words' ? '' : 'words'">
        Dictionary: {{ words.length }} {{ words.length === 1 ? "word" : "words" }}
      </button>
      <button type="button" class="link" :aria-pressed="manage === 'ignored'" @click="manage = manage === 'ignored' ? '' : 'ignored'">Ignored: {{ ignored.length }}</button>
    </footer>
  </aside>
</template>
