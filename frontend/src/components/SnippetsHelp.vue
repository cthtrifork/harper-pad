<script setup>
// The snippets help page, shown inside the drafts drawer (opened from its footer). Drawn from the same table the editor uses, so
// it cannot drift from what Enter does. Each card shows the result as a small mockup, the selected part highlighted; pressing a card
// puts that result in the editor where the cursor is. The drawer stays open, so several can be inserted in a row.
import { ref } from "vue";
import { SNIPPET_LIST } from "../lib/editor/snippets.ts";

const emit = defineEmits(["back", "insert"]);

// The snippet just inserted shows "Inserted" for a moment, since the editor may be out of sight (a phone).
const done = ref("");
let timer = 0;
function insert(trigger) {
  emit("insert", trigger);
  done.value = trigger;
  clearTimeout(timer);
  timer = setTimeout(() => (done.value = ""), 1200);
}
</script>

<template>
  <section class="snippets" aria-label="Snippets">
    <header>
      <button type="button" class="back" aria-label="Back to drafts" @click="emit('back')">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5l-3.5 3.5 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
      </button>
      <h2>Snippets</h2>
    </header>
    <p class="hint">Type a snippet alone on a line, then press Enter. The line becomes the text below, with the highlighted part selected, so the next thing you type replaces it. Or press a snippet here to put it in the text at the cursor.</p>
    <ul>
      <li v-for="s in SNIPPET_LIST" :key="s.trigger">
        <button type="button" class="card" :title="`Insert ${s.trigger} at the cursor`" @click="insert(s.trigger)">
        <span class="row">
          <code class="trigger">{{ s.trigger }}</code>
          <span class="about" :class="{ done: done === s.trigger }" :role="done === s.trigger ? 'status' : undefined">{{ done === s.trigger ? "Inserted" : s.about }}</span>
        </span>
        <span class="mock">{{ s.before }}<mark v-if="s.mid">{{ s.mid }}</mark><span v-else class="caret" aria-hidden="true"></span>{{ s.after }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
