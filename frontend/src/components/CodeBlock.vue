<script setup lang="ts">
// A fenced code block in the preview. It shows the plain text at once and swaps in the coloured runs when the language's chunk
// has loaded, so a block never waits and an unknown language (or a failed load) just stays plain. Runs are text nodes in spans,
// never HTML (docs/security.md).
import { onBeforeUnmount, ref, watchEffect } from "vue";
import { highlight, languageFor } from "../lib/highlight.ts";

const props = defineProps({
  code: { type: String, default: "" },
  info: { type: String, default: "" },
});

const runs = ref<{ text: string; cls: string }[] | null>(null);

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

// The copy button: the block's plain text goes to the clipboard and the icon is a check for two seconds. The async API needs a secure
// context and a permission; where it is missing or refuses, a hidden textarea and execCommand (the old way, still the one that works
// in some webviews) is tried. A copy that fails both says nothing, like the file chip's copy button.
const copied = ref(false);
let copiedTimer = 0;
onBeforeUnmount(() => clearTimeout(copiedTimer));

function legacyCopy(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;top:0;left:0;opacity:0;font-size:16px";
  document.body.appendChild(ta);
  ta.select();
  ta.setSelectionRange(0, text.length); // iOS ignores select() alone
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }
  ta.remove();
  return ok;
}

async function copy() {
  let ok = false;
  try {
    await navigator.clipboard.writeText(props.code);
    ok = true;
  } catch {
    ok = legacyCopy(props.code);
  }
  if (!ok) return;
  copied.value = true;
  clearTimeout(copiedTimer);
  copiedTimer = window.setTimeout(() => (copied.value = false), 2000);
}
</script>

<template>
  <div class="code-block">
    <button type="button" class="code-copy" :aria-label="copied ? 'Code copied' : 'Copy code'" :title="copied ? 'Copied' : 'Copy code'" @click="copy">
      <svg v-if="copied" width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.3l2.4 2.4 4.6-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <svg v-else width="14" height="14" viewBox="0 0 12 12" aria-hidden="true"><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" /><path d="M8 4V2.7A1.2 1.2 0 0 0 6.8 1.5H2.7A1.2 1.2 0 0 0 1.5 2.7v4.1A1.2 1.2 0 0 0 2.7 8H4" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" /></svg>
    </button>
    <span class="code-live" role="status">{{ copied ? "Code copied" : "" }}</span>
    <pre><code><template v-if="runs"><span v-for="(r, i) in runs" :key="i" :class="r.cls || undefined">{{ r.text }}</span></template><template v-else>{{ code }}</template></code></pre>
  </div>
</template>
