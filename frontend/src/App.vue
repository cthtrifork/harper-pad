<script setup>
import { onMounted, ref } from "vue";
import { PadService } from "../bindings/github.com/cthtrifork/harper-pad/internal/app";
import Editor from "./components/Editor.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import UpdateButton from "./components/UpdateButton.vue";
import { createLinter } from "./lib/harper.js";

const sample = "This are a example of a sentense with with a few mistakes. Harper shuld find them.";
const state = ref("loading");
const error = ref("");
const setupMs = ref(0);
const lintMs = ref(0);
const problems = ref([]);
const showProblems = ref(true);
const goVersion = ref("");
const harper = ref(null);
const editor = ref(null);

function onResult({ ms }) {
  lintMs.value = ms;
}

// The editor emits on every update; only replace the list when it really changed, so the panel does not re-render per keystroke.
function onProblems(list) {
  if (JSON.stringify(list) !== JSON.stringify(problems.value)) problems.value = list;
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
    <header class="bar">
      <span class="brand">Harper Pad</span>
      <span class="spacer"></span>
      <button type="button" class="toggle" :aria-pressed="showProblems" :class="{ on: showProblems }" @click="showProblems = !showProblems">
        Problems <span class="count">{{ problems.length }}</span>
      </button>
      <UpdateButton />
    </header>
    <div class="body">
      <main class="page" @mousedown.self.prevent="editor?.focusEnd()">
        <Editor v-if="harper" ref="editor" :harper="harper" :doc="sample" @result="onResult" @problems="onProblems" />
        <p v-else-if="state === 'loading'" class="mute">Starting Harper...</p>
        <pre v-if="error" class="error">{{ error }}</pre>
      </main>
      <ProblemsPanel v-if="showProblems" :problems="problems" @jump="editor?.jump($event)" @fix="(p, i) => editor?.fix(p, i)" />
    </div>
    <footer class="status">
      <span :class="['state', state]">Harper {{ state }}</span>
      <span v-if="state === 'ready'">{{ problems.length }} {{ problems.length === 1 ? "problem" : "problems" }}</span>
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
.bar {
  height: 48px;
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 16px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.brand {
  font-weight: 600;
}
.spacer {
  flex: 1;
}
.toggle {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px 0 12px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
}
.toggle.on {
  border-color: var(--accent);
}
.count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 11px;
  font-weight: 600;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
}
.page {
  flex: 1;
  min-width: 0;
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
