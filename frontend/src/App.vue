<script setup>
import { onMounted, ref } from "vue";
import { PadService } from "../bindings/github.com/cthtrifork/harper-pad/internal/app";
import Editor from "./components/Editor.vue";
import ProblemsPanel from "./components/ProblemsPanel.vue";
import UpdateButton from "./components/UpdateButton.vue";
import { createLinter } from "./lib/harper.js";
import { loadPersonal, savePersonal } from "./lib/personal.js";

const sample = "This are a example of a sentense with with a few mistakes. Harper shuld find them.";
const state = ref("loading");
const error = ref("");
const setupMs = ref(0);
const lintMs = ref(0);
const problems = ref([]);
const showProblems = ref(true);
const goVersion = ref("");
const demo = ref(""); // banner text in demo mode (development builds only); the timings are then fixed
const counts = ref({ words: 0, chars: 0 });
const harper = ref(null);
const personal = ref({ words: 0, ignored: 0 });
const saveError = ref("");
const editor = ref(null);

// Show the editor first, then load Harper: you can type while the wasm loads, and the first check runs as soon as it is ready.
// Harper's 20 MB wasm is fetched after the first paint and not before it, so it never competes with the page for the first
// frame (Lighthouse counts every request in flight before the largest contentful paint against it). The wait is one frame; the
// timer is a fallback for a window that is hidden at start, where the browser does not run animation frames.
const afterFirstPaint = () =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, 300);
    requestAnimationFrame(() =>
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }),
    );
  });
const t0 = performance.now();
const loading = afterFirstPaint()
  .then(() => createLinter())
  .then(async (linter) => {
    // Load the saved dictionary and ignore list into Harper before its first check, so findings already dealt with never show up.
    try {
      personal.value = await loadPersonal(linter);
    } catch (err) {
      saveError.value = `Could not load settings: ${err?.message || err}`;
    }
    return linter;
  });

// 850 ms -> "850 ms", 1234 ms -> "1.2 s".
function fmt(ms) {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

// Demo mode shows these instead of the measured times, so screenshots are the same on every run.
const DEMO_SETUP_MS = 1200;
const DEMO_LINT_MS = 20;

function onResult({ ms }) {
  lintMs.value = ms;
}

// The editor emits on every update; only replace the list when it really changed, so the panel does not re-render per keystroke.
function onProblems(list) {
  if (JSON.stringify(list) !== JSON.stringify(problems.value)) problems.value = list;
}

// Save the dictionary and ignore list after a change. A failure is shown in the status bar; the change still holds for this run.
async function persist() {
  try {
    personal.value = await savePersonal(harper.value);
    saveError.value = "";
  } catch (err) {
    saveError.value = `Could not save settings: ${err?.message || err}`;
  }
}

onMounted(async () => {
  PadService.DemoMode().then(
    (text) => (demo.value = text),
    () => {},
  );
  PadService.Version().then(
    (v) => (goVersion.value = v),
    (err) => (goVersion.value = `unavailable: ${err}`),
  );
  try {
    harper.value = await loading;
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
    <p v-if="demo" id="mode-banner" class="banner">{{ demo }}</p>
    <div class="body">
      <main class="page" @mousedown.self.prevent="editor?.focusEnd()">
        <Editor ref="editor" :harper="harper" :doc="sample" :persist="persist" @result="onResult" @problems="onProblems" @stats="counts = $event" />
        <pre v-if="error" class="error">{{ error }}</pre>
      </main>
      <ProblemsPanel v-if="showProblems" :problems="problems" :words="personal.words" :ignored="personal.ignored" @jump="editor?.jump($event)" @fix="(p, i) => editor?.fix(p, i)" />
    </div>
    <footer class="status">
      <span :class="['state', state]">{{ state === "loading" ? "Starting Harper, you can already type..." : `Harper ${state}` }}</span>
      <span v-if="state === 'ready'">{{ problems.length }} {{ problems.length === 1 ? "problem" : "problems" }}</span>
      <span id="doc-stats">{{ counts.words }} {{ counts.words === 1 ? "word" : "words" }}, {{ counts.chars }} {{ counts.chars === 1 ? "char" : "chars" }}</span>
      <span v-if="state === 'ready'" class="mute">started in {{ fmt(demo ? DEMO_SETUP_MS : setupMs) }}, last check {{ fmt(demo ? DEMO_LINT_MS : lintMs) }}</span>
      <span v-if="saveError" class="state failed">{{ saveError }}</span>
      <span class="spacer"></span>
      <span class="mute">Version {{ goVersion || "..." }}</span>
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
.banner {
  flex: none;
  margin: 0;
  padding: 6px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--raised);
  color: var(--text);
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
