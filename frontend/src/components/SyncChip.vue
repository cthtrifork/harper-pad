<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

// The sync chip in the status bar and its pop-up (docs/sync.md). `sync` is useSync's result. A bottom sheet on a phone (styles/sync-chip.css).
const props = defineProps({ sync: { type: Object, required: true } });

const LABELS = {
  off: "Sync off",
  // The chip is the connection only (what happened to the draft is the status line's job, see lib/statusLine.js).
  synced: "Sync on",
  syncing: "Sync on",
  pending: "Sync on",
  offline: "Offline",
  signin: "Sign in again",
};
const status = computed(() => props.sync.status.value);
const label = computed(() => LABELS[status.value] ?? "Sync");
// The form is for a device that is not enrolled, or whose enrollment the server refused.
const showForm = computed(() => status.value === "off" || status.value === "signin");

const open = ref(false);
const root = ref(null);
const invite = ref("");
const busy = ref(false);

const host = computed(() => {
  try {
    return new URL(props.sync.info.value?.server ?? "").host;
  } catch {
    return "";
  }
});

function toggle() {
  open.value = !open.value;
}

// With a mouse, the invite field is ready to paste into. On a phone it is not focused for the person: that would open the keyboard at once.
watch(open, async (isOpen) => {
  if (!isOpen || !showForm.value || !window.matchMedia("(pointer: fine)").matches) return;
  await nextTick();
  document.getElementById("sync-invite")?.focus();
});

async function add() {
  if (busy.value || !invite.value.trim()) return;
  busy.value = true;
  const ok = await props.sync.enroll(invite.value);
  busy.value = false;
  if (ok) {
    invite.value = "";
    open.value = false;
  }
}

const lastSyncText = computed(() => {
  const at = props.sync.lastSync.value;
  return at ? new Date(at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
});
const syncing = computed(() => status.value === "syncing");

async function turnOff() {
  await props.sync.turnOff();
  open.value = false;
}

// A click anywhere else, or Escape, closes it.
function onPointerDown(e) {
  if (open.value && !root.value?.contains(e.target)) open.value = false;
}
function onKeydown(e) {
  if (e.key === "Escape") open.value = false;
}
onMounted(() => {
  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeydown);
});
onBeforeUnmount(() => {
  window.removeEventListener("pointerdown", onPointerDown);
  window.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <span ref="root" class="sync">
    <button id="sync-chip" type="button" class="sync-chip" :class="status" :aria-label="`${label}, open sync`" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
      <svg v-if="status === 'syncing'" class="mark spin" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
      <svg v-else-if="status === 'offline'" class="mark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      <svg v-else-if="status === 'signin'" class="mark" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 4.8v3.7M8 10.9v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      <span v-else class="dot" aria-hidden="true"></span>
      <span class="txt">{{ label }}</span>
    </button>

    <Transition name="pop">
      <section v-if="open" class="sync-panel" role="dialog" :aria-label="showForm ? 'Sync this device' : 'Sync'">
        <form v-if="showForm" @submit.prevent="add">
          <h2>{{ status === "signin" ? "Signed out" : "Sync this device" }}</h2>
          <p class="mute">
            <template v-if="status === 'signin'">Your drafts are safe. Paste a new invite link.</template>
            <template v-else>Paste the invite link from the admin page.</template>
          </p>
          <label for="sync-invite">Invite link</label>
          <input id="sync-invite" v-model="invite" type="text" class="in" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://…/join#…" :aria-invalid="!!sync.error.value" aria-describedby="sync-error" />
          <p v-if="sync.error.value" id="sync-error" class="error" role="alert">{{ sync.error.value }}</p>
          <div class="actions">
            <button type="submit" class="primary" :class="{ busy }" :disabled="busy || !invite.trim()">
              <span class="label">Add this device</span>
              <svg v-if="busy" class="spin" width="14" height="14" viewBox="0 0 10 10" aria-label="Adding" role="img"><path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
            </button>
          </div>
        </form>
        <div v-else>
          <h2>{{ status === "offline" ? "Offline" : `Synced with ${host}` }}</h2>
          <p v-if="status === 'pending'" class="mute">Some drafts are not sent yet.</p>
          <p v-if="status === 'offline'" class="mute">Server not reachable. Drafts are kept here.</p>
          <p v-if="sync.summary.value" id="sync-summary" class="summary" role="status">
            {{ sync.summary.value }}<span v-if="lastSyncText" class="mute"> · {{ lastSyncText }}</span>
          </p>
          <div class="actions between">
            <button type="button" class="link" @click="turnOff">Turn off sync on this device</button>
            <button id="sync-all" type="button" class="primary" :class="{ busy: syncing }" :disabled="syncing" @click="sync.syncAll()">
              <span class="label">Sync all</span>
              <svg v-if="syncing" class="spin" width="14" height="14" viewBox="0 0 10 10" aria-label="Syncing" role="img"><path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
            </button>
          </div>
          <p class="note mute">Drafts stay here, and on the server.</p>
        </div>
      </section>
    </Transition>
  </span>
</template>
