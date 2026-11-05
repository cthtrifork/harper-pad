<script setup>
// The snippets help page, shown inside the drafts drawer (opened from its footer). Drawn from the same table the editor uses, so
// it cannot drift from what Enter does. Each row shows the result as a small mockup, the selected part highlighted.
import { SNIPPET_LIST } from "../lib/editor/snippets.js";

const emit = defineEmits(["back"]);
</script>

<template>
  <section class="snippets" aria-label="Snippets">
    <header>
      <button type="button" class="back" aria-label="Back to drafts" @click="emit('back')">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5l-3.5 3.5 3.5 3.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none" /></svg>
      </button>
      <h2>Snippets</h2>
    </header>
    <p class="hint">Type a snippet alone on a line, then press Enter. The line becomes the text below, with the highlighted part selected, so the next thing you type replaces it.</p>
    <ul>
      <li v-for="s in SNIPPET_LIST" :key="s.trigger">
        <div class="row">
          <code class="trigger">{{ s.trigger }}</code>
          <span class="about">{{ s.about }}</span>
        </div>
        <pre class="mock">{{ s.before }}<mark v-if="s.mid">{{ s.mid }}</mark><span v-else class="caret" aria-hidden="true"></span>{{ s.after }}</pre>
      </li>
    </ul>
  </section>
</template>
