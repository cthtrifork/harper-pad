<script setup>
import "../styles/update-button.css"; // loaded with this component, so the web build never carries it
import { Browser } from "@wailsio/runtime";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { UpdateService } from "../../bindings/github.com/cthtrifork/harper-pad/internal/app";

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
    case "current":
      return { label: "Check again", run: check };
    case "available":
      return { label: `Download ${found.value}`, run: download };
    case "ready":
      return { label: "Restart to update", run: restart };
    case "checking":
    case "downloading":
      return null;
    default:
      return { label: "Try again", run: check };
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
</script>

<template>
  <div ref="root" class="wrap">
    <button type="button" class="btn" :class="{ open }" :aria-expanded="open" aria-haspopup="dialog" @click="onClick">
      <span v-if="busy()" class="spin" aria-hidden="true"></span>
      <span v-else-if="state === 'available' || state === 'ready'" class="dot" aria-hidden="true"></span>
      {{ info.version || "..." }}
    </button>

    <div v-if="open" class="pop" role="dialog" aria-label="Updates">
      <template v-if="!info.enabled">
        <h3>Updates are off here</h3>
        <p>{{ info.reason }}</p>
      </template>
      <template v-else-if="state === 'checking'">
        <h3>Checking GitHub releases</h3>
        <p>Looking for a newer version.</p>
      </template>
      <template v-else-if="state === 'current'">
        <h3>You are up to date</h3>
        <p>{{ info.version }} is the latest release.</p>
      </template>
      <template v-else-if="state === 'available'">
        <h3>Version {{ found }} is available</h3>
        <p>You have {{ info.version }}. The download is verified before it is installed.</p>
      </template>
      <template v-else-if="state === 'downloading'">
        <h3>Downloading {{ found }}</h3>
        <p>Keep working. The app stays as it is until you restart.</p>
      </template>
      <template v-else-if="state === 'ready'">
        <h3>{{ found }} is ready</h3>
        <p>Restart to finish the update.</p>
      </template>
      <template v-else>
        <h3>Could not update</h3>
        <p>{{ error }}</p>
      </template>
      <div class="foot">
        <button v-if="action" type="button" class="primary" @click="action.run">{{ action.label }}</button>
        <button type="button" class="link" @click="whatsNew">What is new</button>
      </div>
    </div>
  </div>
</template>
