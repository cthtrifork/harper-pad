<script setup>
import { onMounted, ref } from "vue";
import { PadService } from "../bindings/github.com/cthtrifork/harper-pad/internal/app";
import Editor from "./components/Editor.vue";
import { createLinter } from "./lib/harper.js";

const sample = "This are a example of a sentense with with a few mistakes. Harper shuld find them.";
const state = ref("loading");
const error = ref("");
const setupMs = ref(0);
const lintMs = ref(0);
const problems = ref(0);
const goVersion = ref("");
const harper = ref(null);

function onResult({ count, ms }) {
  problems.value = count;
  lintMs.value = ms;
}

onMounted(async () => {
  PadService.Version().then(
    (v) => (goVersion.value = v),
    (err) => (goVersion.value = `bridge failed: ${err}`),
  );
  try {
    const t0 = performance.now();
    harper.value = await createLinter();
    setupMs.value = Math.round(performance.now() - t0);
    state.value = "ready";
  } catch (err) {
    state.value = "failed";
    error.value = String(err?.stack || err);
  }
});
</script>

<template>
  <div class="app">
    <main class="page">
      <Editor v-if="harper" :harper="harper" :doc="sample" @result="onResult" />
      <p v-else-if="state === 'loading'" class="mute">Starting Harper...</p>
      <pre v-if="error" class="error">{{ error }}</pre>
    </main>
    <footer class="status">
      <span :class="['state', state]">Harper {{ state }}</span>
      <span v-if="state === 'ready'">{{ problems }} {{ problems === 1 ? "problem" : "problems" }}</span>
      <span v-if="state === 'ready'" class="mute">setup {{ setupMs }} ms, last check {{ lintMs }} ms</span>
      <span class="spacer"></span>
      <span class="mute">Go bridge {{ goVersion || "..." }}</span>
    </footer>
  </div>
</template>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}
.page {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 56px 24px 24px;
}
.status {
  display: flex;
  gap: 16px;
  align-items: center;
  padding: 6px 16px;
  border-top: 1px solid var(--line);
  background: var(--panel);
  font-size: 12px;
}
.spacer {
  flex: 1;
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
</style>
