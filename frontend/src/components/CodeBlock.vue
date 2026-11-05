<script setup>
// A fenced code block in the preview. It shows the plain text at once and swaps in the coloured runs when the language's chunk
// has loaded, so a block never waits and an unknown language (or a failed load) just stays plain. Runs are text nodes in spans,
// never HTML (docs/security.md).
import { ref, watchEffect } from "vue";
import { highlight, languageFor } from "../lib/highlight.js";

const props = defineProps({
  code: { type: String, default: "" },
  info: { type: String, default: "" },
});

const runs = ref(null);

watchEffect((onCleanup) => {
  const lang = languageFor(props.info);
  const code = props.code;
  let stale = false;
  onCleanup(() => {
    stale = true;
  });
  if (!lang) {
    runs.value = null;
    return;
  }
  highlight(code, lang).then(
    (r) => {
      if (!stale) runs.value = r;
    },
    () => {
      if (!stale) runs.value = null;
    },
  );
});
</script>

<template>
  <pre><code><template v-if="runs"><span v-for="(r, i) in runs" :key="i" :class="r.cls || undefined">{{ r.text }}</span></template><template v-else>{{ code }}</template></code></pre>
</template>
