<script setup>
import "../styles/update-button.css"; // loaded with this component, so the web build never carries it
import { Browser } from "@wailsio/runtime";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { UpdateService } from "../../bindings/github.com/cthtrifork/harper-pad/internal/app";
import { copyDiagnostics } from "../lib/diagnostics.js";

const LATEST_RELEASE = "https://github.com/cthtrifork/harper-pad/releases/latest";

const info = ref({ version: "", enabled: false, reason: "" });
// idle -> checking -> current | available | error; available -> downloading -> ready | error
const state = ref("idle");
const found = ref("");
const error = ref("");
const open = ref(false);
const root = ref(null);

const busy = () => state.value === "checking" || state.value === "downloading";

async function run(next, work) {
  state.value = next;
  error.value = "";
  try {
    await work();
  } catch (err) {
    error.value = String(err?.message || err);
    state.value = "error";
    open.value = true;
  }
}

const check = () =>
  run("checking", async () => {
    const status = await UpdateService.CheckForUpdates();
    found.value = status.version;
    state.value = status.available ? "available" : "current";
  });

const download = () =>
  run("downloading", async () => {
    await UpdateService.InstallUpdate();
    state.value = "ready";
  });

const restart = () =>
  run("ready", async () => {
    await UpdateService.RestartToUpdate();
  });

// The first click checks, because updates are only looked for on request; later clicks just toggle the popover.
function onClick() {
  const first = info.value.enabled && state.value === "idle";
  open.value = !open.value;
  if (first) check();
}

// The one primary action of the popover, if the current state has one.
const action = computed(() => {
  if (!info.value.enabled) return null;
  switch (state.value) {
    case "available":
      return { label: `Download ${found.value}`, run: download };
    case "ready":
      return { label: "Restart to update", run: restart };
    case "checking":
    case "downloading":
      return null;
    case "error":
      return { label: "Try again", run: check };
    default:
      return null; // idle and current offer "Check for updates" instead
  }
});

const whatsNew = () => Browser.OpenURL(LATEST_RELEASE).catch(() => {});

function outside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false;
}
function onKey(e) {
  if (e.key === "Escape") open.value = false;
}

onMounted(async () => {
  document.addEventListener("mousedown", outside);
  document.addEventListener("keydown", onKey);
  try {
    info.value = await UpdateService.UpdateInfo();
  } catch (err) {
    info.value = { version: "", enabled: false, reason: String(err?.message || err) };
  }
});
onBeforeUnmount(() => {
  document.removeEventListener("mousedown", outside);
  document.removeEventListener("keydown", onKey);
});

// Copy a diagnostics report (lib/diagnostics.js) for a bug report; the link says what happened for two seconds.
const copied = ref("");
let copiedTimer = 0;
async function copyReport() {
  copied.value = (await copyDiagnostics(info.value.version)) ? "Copied" : "Could not copy";
  clearTimeout(copiedTimer);
  copiedTimer = setTimeout(() => (copied.value = ""), 2000);
}
onBeforeUnmount(() => clearTimeout(copiedTimer));
</script>

<template>
  <div ref="root" class="wrap">
    <button type="button" class="btn" :class="{ open }" :aria-expanded="open" aria-haspopup="dialog" @click="onClick">
      <span v-if="busy()" class="spin" aria-hidden="true"></span>
      <span v-else-if="state === 'available' || state === 'ready'" class="dot" aria-hidden="true"></span>
      {{ info.version || "..." }}
    </button>

    <Transition name="pop">
      <div v-if="open" class="pop" role="dialog" aria-label="Updates">
        <div class="status" role="status">
          <template v-if="!info.enabled">
            <svg class="mark warn" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.1" /><circle cx="12" cy="12" r="9" /></svg>
            <div>
              <h3>Updates unavailable</h3>
              <p>{{ info.reason }}</p>
            </div>
          </template>
          <template v-else-if="state === 'checking'">
            <svg class="mark spin" width="16" height="16" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
            <div>
              <h3>Checking for updates</h3>
              <p>Looking at GitHub releases.</p>
            </div>
          </template>
          <template v-else-if="state === 'current'">
            <svg class="mark ok" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <div>
              <h3>Up to date</h3>
              <p>{{ info.version }} is the latest release.</p>
            </div>
          </template>
          <template v-else-if="state === 'available'">
            <svg class="mark warn" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.1" /><circle cx="12" cy="12" r="9" /></svg>
            <div>
              <h3>{{ found }} is available</h3>
              <p>You have {{ info.version }}. The download is verified before it is installed.</p>
            </div>
          </template>
          <template v-else-if="state === 'downloading'">
            <svg class="mark spin" width="16" height="16" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" /></svg>
            <div>
              <h3>Downloading {{ found }}</h3>
              <p>Keep working. The app stays as it is until you restart.</p>
            </div>
          </template>
          <template v-else-if="state === 'ready'">
            <svg class="mark ok" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <div>
              <h3>{{ found }} is ready</h3>
              <p>Restart to finish the update.</p>
            </div>
          </template>
          <template v-else-if="state === 'error'">
            <svg class="mark warn" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 8v5M12 16.5v.1" /><circle cx="12" cy="12" r="9" /></svg>
            <div>
              <h3>Could not update</h3>
              <p>{{ error }}</p>
            </div>
          </template>
          <template v-else>
            <div>
              <h3>Harper Pad {{ info.version }}</h3>
              <p>Updates are looked for on request.</p>
            </div>
          </template>
        </div>
        <div class="sep"></div>
        <button v-if="action" type="button" class="row primary" @click="action.run">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" /></svg>
          {{ action.label }}
        </button>
        <button v-if="info.enabled && !busy() && (state === 'current' || state === 'idle')" type="button" class="row" @click="check">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" /></svg>
          Check for updates
        </button>
        <button type="button" class="row" @click="whatsNew">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /></svg>
          What's new
        </button>
        <button type="button" class="row" @click="copyReport">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h8" /></svg>
          {{ copied || "Copy diagnostics" }}
        </button>
      </div>
    </Transition>
  </div>
</template>
