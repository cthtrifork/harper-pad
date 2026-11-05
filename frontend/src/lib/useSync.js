import { computed, ref } from "vue";
import { pushDraft } from "./syncClient.js";
import { parseInviteUrl, enrollDevice, SyncError } from "./syncEnroll.js";

// How long after a save the draft is pushed (docs/sync.md, "When sync happens"): long enough that typing is one push, not many.
const PUSH_DELAY_MS = 2000;

// What the sync chip shows, and the work behind it: enrolling this device and pushing a draft after it is saved. First slice: the web
// build only, and only pushes (Sync all, opening a note and conflicts are later steps, see docs/sync.md).
//
//   status: off | synced | syncing | pending | offline | signin
//
// `origin` is the sync server this build was made for (SYNC_ORIGIN, "" when none: then nothing shows). `deviceStore` is syncDevice from
// backend.js, `drafts` the web store's {get, syncState, markSynced}, and `hash` is contentHash.
export function useSync({ origin, deviceStore, drafts, hash, fetchFn, delay = PUSH_DELAY_MS }) {
  const configured = !!origin && !!deviceStore && !!drafts;
  const status = ref("off");
  const error = ref(""); // the last message for the pop-up, "" when there is none
  const info = ref(null); // {server, deviceName} while enrolled
  const enrolled = computed(() => info.value !== null);

  let device = null;
  let timer = null;
  const waiting = new Set();
  let chain = Promise.resolve();

  async function init() {
    if (!configured) return;
    device = await deviceStore.load();
    info.value = device ? { server: device.server, deviceName: device.deviceName } : null;
    status.value = device ? "synced" : "off";
  }

  async function enroll(text, deviceName) {
    error.value = "";
    try {
      // The page may only call the origin its policy names; an invite for another server would be blocked by the browser.
      if (parseInviteUrl(text).server !== origin)
        throw new SyncError("other-server", "This invite is for a different server than this app is set up for.");
      await enrollDevice({ text, deviceName, store: deviceStore, fetchFn });
    } catch (err) {
      error.value = err instanceof SyncError ? err.message : "Something went wrong. Try again.";
      return false;
    }
    await init();
    return true;
  }

  // Forget this device. Drafts and their sync state stay; the server keeps its copies.
  async function turnOff() {
    clearTimeout(timer);
    waiting.clear();
    await deviceStore.clear();
    device = null;
    error.value = "";
    await init();
  }

  async function push(id) {
    const draft = await drafts.get(id);
    const state = await drafts.syncState(id);
    const out = await pushDraft({ device, draft, state, fetchFn });
    if (out.result === "ok") {
      await drafts.markSynced(id, { hash: await hash(draft.format, draft.content), updatedAt: draft.updatedAt, version: out.version });
    }
    return out.result;
  }

  async function run() {
    if (!device) return;
    const ids = [...waiting];
    waiting.clear();
    let result = "ok";
    status.value = "syncing";
    for (const id of ids) {
      try {
        if ((await push(id)) === "conflict") result = "conflict";
      } catch (err) {
        if (err instanceof SyncError && err.code === "unreachable") {
          status.value = "offline";
          return;
        }
        if (err instanceof SyncError && err.code === "signin") {
          status.value = "signin";
          error.value = "This device was signed out. Paste a new invite link to start syncing again.";
          return;
        }
        result = "error";
      }
    }
    status.value = result === "ok" ? "synced" : "pending";
  }

  // Call after a draft was saved. It is pushed once typing has stopped for `delay`; a failure leaves it unsynced, which the next save
  // retries (the draft is "changed" until the server has its hash).
  function draftSaved(id) {
    if (!device || status.value === "signin") return;
    waiting.add(id);
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(run);
    }, delay);
  }

  return { configured, status, error, info, enrolled, init, enroll, turnOff, draftSaved };
}
