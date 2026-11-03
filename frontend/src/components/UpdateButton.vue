<script setup>
import { Browser } from "@wailsio/runtime";
import { onBeforeUnmount, onMounted, ref } from "vue";
import { PadService } from "../../bindings/github.com/cthtrifork/harper-pad/internal/app";

const RELEASES = "https://github.com/cthtrifork/harper-pad/releases/tag/";

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
  }
}

const check = () =>
  run("checking", async () => {
    const status = await PadService.CheckForUpdates();
    found.value = status.version;
    state.value = status.available ? "available" : "current";
  });

const download = () =>
  run("downloading", async () => {
    await PadService.InstallUpdate();
    state.value = "ready";
  });

const restart = () =>
  run("ready", async () => {
    await PadService.RestartToUpdate();
  });

const whatsNew = () => Browser.OpenURL(RELEASES + found.value).catch(() => {});

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
    info.value = await PadService.UpdateInfo();
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
    <button
      type="button"
      class="btn"
      :class="{ open, ready: state === 'ready' }"
      :aria-expanded="open"
      aria-haspopup="dialog"
      @click="open = !open"
    >
      <span v-if="state === 'available'" class="dot" aria-hidden="true"></span>
      <template v-if="state === 'available'">Update to {{ found }}</template>
      <template v-else-if="state === 'ready'">Restart to update</template>
      <template v-else>{{ info.version || "..." }}</template>
    </button>

    <div v-if="open" class="pop" role="dialog" aria-label="Updates">
      <template v-if="!info.enabled">
        <h3>Updates are off here</h3>
        <p>{{ info.reason }}</p>
      </template>
      <template v-else-if="state === 'idle'">
        <h3>Harper Pad {{ info.version }}</h3>
        <p>Updates are only checked when you ask.</p>
        <button type="button" class="primary" @click="check">Check for updates</button>
      </template>
      <template v-else-if="state === 'checking'">
        <h3>Checking GitHub releases</h3>
        <p>Looking for a newer version.</p>
      </template>
      <template v-else-if="state === 'current'">
        <h3>You are up to date</h3>
        <p>{{ info.version }} is the latest release.</p>
        <button type="button" class="primary" @click="check">Check again</button>
      </template>
      <template v-else-if="state === 'available'">
        <h3>Version {{ found }} is available</h3>
        <p>You have {{ info.version }}. The download is verified before it is installed.</p>
        <div class="row">
          <button type="button" class="primary" @click="download">Download {{ found }}</button>
          <button type="button" class="link" @click="whatsNew">What is new</button>
        </div>
      </template>
      <template v-else-if="state === 'downloading'">
        <h3>Downloading {{ found }}</h3>
        <p>Keep working. The app stays as it is until you restart.</p>
      </template>
      <template v-else-if="state === 'ready'">
        <h3>{{ found }} is ready</h3>
        <p>Restart to finish the update.</p>
        <div class="row">
          <button type="button" class="primary" @click="restart">Restart to update</button>
          <button type="button" class="link" @click="open = false">Later</button>
        </div>
      </template>
      <template v-else>
        <h3>Could not update</h3>
        <p>{{ error }}</p>
        <button type="button" class="primary" @click="check">Try again</button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.wrap {
  position: relative;
}
.btn {
  height: 32px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--mute);
}
.btn:hover,
.btn.open {
  border-color: var(--line);
  background: var(--raised);
  color: var(--text);
}
.btn.ready {
  border: 0;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
}
.pop {
  position: absolute;
  top: 40px;
  right: 0;
  z-index: 10;
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  background: var(--raised);
  border: 1px solid var(--line);
  border-radius: 10px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
h3 {
  margin: 0;
  font-size: 14px;
  line-height: 1.3;
}
p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--mute);
  overflow-wrap: anywhere;
}
.row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.primary {
  align-self: flex-start;
  height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 6px;
  background: var(--accent);
  color: var(--on-accent);
  font-weight: 600;
}
.link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--c-style);
}
</style>
