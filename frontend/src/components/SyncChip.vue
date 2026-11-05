<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

// The sync chip in the status bar and its pop-up (docs/sync.md). `sync` is useSync's result. A bottom sheet on a phone (styles/sync-chip.css).
const props = defineProps({ sync: { type: Object, required: true } });

const LABELS = {
  off: "Sync off",
  synced: "Synced",
  syncing: "Syncing…",
  pending: "Pending",
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

// A name to start from, so the device list on the server says which device is which.
function guessName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android";
  if (/Windows/.test(ua)) return "Windows";
  if (/Mac/.test(ua)) return "Mac";
  if (/Linux/.test(ua)) return "Linux";
  return "This device";
}
const deviceName = ref(guessName());

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

async function add() {
  if (busy.value || !invite.value.trim()) return;
  busy.value = true;
  const ok = await props.sync.enroll(invite.value, deviceName.value);
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
  if (e.key !== "Escape") return;
  open.value = false;
  props.sync.dismissGone();
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
    <span v-if="sync.notice.value" class="sync-note" :class="sync.notice.value.kind" role="status" :title="sync.notice.value.kind === 'newer' ? 'Sync all, or your next save, settles it' : ''">{{ sync.notice.value.text }}<button v-if="sync.notice.value.kind === 'copy'" type="button" class="link" @click="sync.openCopy(sync.notice.value.copyId)">Open copy</button><button v-if="sync.notice.value.kind === 'removed'" type="button" class="link" @click="sync.undoRemoved()">Undo</button></span>
    <button id="sync-chip" type="button" class="sync-chip" :class="status" :aria-label="`${label}, open sync`" aria-haspopup="dialog" :aria-expanded="open" @click="toggle">
      <svg v-if="status === 'syncing'" class="mark spin" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5a3.5 3.5 0 1 1-3.5 3.5" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" /></svg>
      <svg v-else-if="status === 'offline'" class="mark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
      <svg v-else-if="status === 'signin'" class="mark" width="12" height="12" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.8" /><path d="M8 4.8v3.7M8 10.9v.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
      <span v-else class="dot" aria-hidden="true"></span>
      {{ label }}
    </button>

    <Transition name="pop">
      <div v-if="open" class="sync-scrim" aria-hidden="true"></div>
    </Transition>
    <!-- Deleted on another device while this note is open: a question, not a modal. It takes no focus; Escape leaves it for later. -->
    <Transition name="pop">
      <section v-if="sync.gone.value && !open" id="sync-gone" class="sync-panel sync-gone" role="dialog" aria-label="Deleted elsewhere">
        <h2>Deleted elsewhere</h2>
        <p class="mute">This note was deleted on another device.</p>
        <div class="actions">
          <button type="button" class="quiet" @click="sync.removeGone()">Remove</button>
          <button type="button" class="primary" @click="sync.keepGone()">Keep</button>
        </div>
      </section>
    </Transition>
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
          <label for="sync-name">Device name</label>
          <input id="sync-name" v-model="deviceName" type="text" class="in" maxlength="64" autocomplete="off" />
          <div class="actions">
            <button type="button" class="quiet" @click="open = false">Cancel</button>
            <button type="submit" class="primary" :disabled="busy || !invite.trim()">{{ busy ? "Adding…" : "Add this device" }}</button>
          </div>
        </form>
        <div v-else>
          <h2>{{ status === "offline" ? "Offline" : `Synced with ${host}` }}</h2>
          <p class="mute">This device is “{{ sync.info.value?.deviceName }}”.</p>
          <p v-if="status === 'pending'" class="mute">Some drafts are not sent yet.</p>
          <p v-if="status === 'offline'" class="mute">Server not reachable. Drafts are kept here.</p>
          <p v-if="sync.summary.value" id="sync-summary" class="summary" role="status">
            {{ sync.summary.value }}<span v-if="lastSyncText" class="mute"> · {{ lastSyncText }}</span>
          </p>
          <div class="actions between">
            <button type="button" class="link" @click="turnOff">Turn off sync on this device</button>
            <button id="sync-all" type="button" class="primary" :disabled="syncing" @click="sync.syncAll()">{{ syncing ? "Syncing…" : "Sync all" }}</button>
          </div>
          <p class="note mute">Drafts stay here, and on the server.</p>
        </div>
      </section>
    </Transition>
  </span>
</template>
