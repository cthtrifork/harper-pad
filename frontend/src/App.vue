<script setup>
import { onMounted, ref } from "vue";
import { PadService } from "../bindings/github.com/cthtrifork/harper-pad/internal/app";
import { createLinter, lintText } from "./lib/harper.js";

const sample = "This are a example of a sentense with with a few mistakes. Harper shuld find them.";
const text = ref(sample);
const state = ref("idle");
const error = ref("");
const setupMs = ref(0);
const lintMs = ref(0);
const lints = ref([]);
const goVersion = ref("");
const userAgent = navigator.userAgent;
let linter = null;

async function start() {
  state.value = "loading";
  error.value = "";
  lints.value = [];
  try {
    const t0 = performance.now();
    linter = await createLinter();
    setupMs.value = Math.round(performance.now() - t0);
    state.value = "ready";
    await run();
  } catch (err) {
    state.value = "failed";
    error.value = String(err?.stack || err);
  }
}

async function run() {
  if (!linter) return;
  const t0 = performance.now();
  lints.value = await lintText(linter, text.value);
  lintMs.value = Math.round(performance.now() - t0);
}

onMounted(async () => {
  try {
    goVersion.value = await PadService.Version();
  } catch (err) {
    goVersion.value = `bridge failed: ${err}`;
  }
  start();
});
</script>

<template>
  <main class="spike">
    <h1>Harper Pad: harper.js spike</h1>
    <p class="mute">Does harper.js (WebAssembly in a Web Worker) run in this webview? Go bridge: <code>{{ goVersion || "..." }}</code></p>

    <div class="row">
      <span :class="['state', state]">{{ state }}</span>
      <span v-if="state === 'ready'" class="mute">setup {{ setupMs }} ms, last lint {{ lintMs }} ms</span>
    </div>

    <textarea v-model="text" rows="6" spellcheck="false" @input="run"></textarea>

    <pre v-if="error" class="error">{{ error }}</pre>

    <ul class="lints">
      <li v-for="(l, i) in lints" :key="i">
        <b>{{ l.kind }}</b> <code>{{ l.problem }}</code> ({{ l.start }}-{{ l.end }}, {{ l.suggestions }} suggestions)<br />
        {{ l.message }}
      </li>
      <li v-if="state === 'ready' && !lints.length" class="mute">No findings.</li>
    </ul>

    <p class="mute ua">{{ userAgent }}</p>
  </main>
</template>

<style scoped>
.spike {
  max-width: 860px;
  margin: 0 auto;
  padding: 24px;
}
.row {
  display: flex;
  gap: 16px;
  align-items: center;
  margin: 12px 0;
}
textarea {
  width: 100%;
  background: var(--panel);
  color: var(--text);
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 10px;
  font: inherit;
}
.mute {
  color: var(--mute);
}
.state.ready {
  color: var(--ok);
}
.state.failed {
  color: var(--bad);
}
.error {
  color: var(--bad);
  white-space: pre-wrap;
}
.lints {
  padding-left: 18px;
}
.lints li {
  margin: 8px 0;
}
.ua {
  font-size: 12px;
}
</style>
