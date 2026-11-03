<script setup>
import { computed, ref } from "vue";
import { CATEGORIES } from "../lib/autocorrect.js";

const props = defineProps({
  // Autocorrect: the switch and which kinds of finding may be fixed (see lib/autocorrect.js).
  autocorrect: { type: Object, default: () => ({ on: false, typos: true, caps: true, reps: true, spaces: true }) },
  problems: { type: Array, required: true },
  active: { type: Number, default: -1 },
  words: { type: Array, default: () => [] }, // the personal dictionary
  ignored: { type: Array, default: () => [] }, // ignored findings: {hash, label}
  fixed: { type: Array, default: () => [] }, // what autocorrect changed and can still take back: {id, original, replacement}
});
const emit = defineEmits(["jump", "fix", "remove-word", "remove-ignored", "fix-all", "revert", "autocorrect"]);
const setAuto = (change) => emit("autocorrect", { ...props.autocorrect, ...change });
const choices = ref(false); // the list of what autocorrect may fix is open

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
    <section class="auto" :class="{ on: autocorrect.on }" aria-label="Autocorrect">
      <!-- Collapsed it is one row: the name (which opens the choices) and the switch. -->
      <div class="auto-head">
        <button type="button" class="auto-toggle" :aria-expanded="choices" aria-controls="auto-choices" @click="choices = !choices">
          <svg class="chevron" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2l3 3-3 3" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" /></svg>
          <strong>Autocorrect</strong>
          <span class="mute">{{ autocorrect.on ? (fixed.length ? `On · ${fixed.length} fixed` : "On") : "Off" }}</span>
        </button>
        <button type="button" class="switch" role="switch" aria-label="Autocorrect" :aria-checked="autocorrect.on" @click="setAuto({ on: !autocorrect.on })"></button>
      </div>
      <fieldset v-if="choices" id="auto-choices" class="auto-choices">
        <legend class="sr-only">What autocorrect may fix</legend>
        <p class="mute">Fixes obvious mistakes as you type, once the word is finished.</p>
        <label v-for="c in CATEGORIES" :key="c.id">
          <input type="checkbox" :checked="autocorrect[c.id]" @change="setAuto({ [c.id]: $event.target.checked })" />
          <span>{{ c.label }}</span>
          <span class="example">{{ c.example }}</span>
        </label>
        <p class="mute">Grammar and style always ask you. Code, links and text you did not type are left alone. Ctrl+Z takes a fix back for good.</p>
      </fieldset>
    </section>
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
