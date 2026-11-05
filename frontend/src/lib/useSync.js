import { computed, ref } from "vue";
import { createSyncer, summaryText } from "./syncRun.js";
import { parseInviteUrl, enrollDevice, SyncError } from "./syncEnroll.js";

// How long after a save the draft is pushed (docs/sync.md, "When sync happens"): long enough that typing is one push, not many.
const PUSH_DELAY_MS = 2000;

// What the sync chip shows, and the work behind it: enrolling this device, pushing a draft after it is saved, and Sync all. Web build
// only for now; opening a note is a later step (docs/sync.md).
//
//   status: off | synced | syncing | pending | offline | signin
//
// `origin` is the sync server this build was made for (SYNC_ORIGIN, "" when none: then nothing shows). `deviceStore` is syncDevice from
// backend.js and `drafts` the web store (see createSyncer: all syncing, conflicts included, is done there, not here). For Sync all: `prepare` saves what is typed first,
// `skip` returns the ids to leave alone (the open draft), `onChanged` is called when a run changed the local drafts, and `autoSync`
// runs it when the app starts and after enrolling.
export function useSync({
  origin,
  deviceStore,
  drafts,
  fetchFn,
  delay = PUSH_DELAY_MS,
  autoSync = true,
  prepare = async () => {},
  skip = () => new Set(),
  onChanged = () => {},
}) {
  const configured = !!origin && !!deviceStore && !!drafts;
  const status = ref("off");
  const error = ref(""); // the last message for the pop-up, "" when there is none
  const info = ref(null); // {server, deviceName} while enrolled
  const summary = ref(""); // what the last Sync all did, "3 uploaded, 2 downloaded"
  const lastSync = ref(0); // when it finished, ms
  const notice = ref(null); // {id, kind: "updated" | "newer", text} about the open draft, or null
  const enrolled = computed(() => info.value !== null);

  let device = null;
  let timer = null;
  let noticeTimer = null;
  const waiting = new Set();
  let chain = Promise.resolve();

  async function init() {
    if (!configured) return;
    device = await deviceStore.load();
    info.value = device ? { server: device.server, deviceName: device.deviceName } : null;
    status.value = device ? "synced" : "off";
    if (device && autoSync) syncAll();
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
    notice.value = null;
    await deviceStore.clear();
    device = null;
    error.value = "";
    summary.value = "";
    await init();
  }

  async function run() {
    if (!device) return;
    const ids = [...waiting];
    waiting.clear();
    const syncer = createSyncer({ device, drafts, fetchFn });
    let failed = false;
    status.value = "syncing";
    for (const id of ids) {
      try {
        const key = await syncer.one(id);
        if (key === "failed") failed = true;
        else if (notice.value?.id === id && notice.value.kind === "newer") notice.value = null;
      } catch (err) {
        if (stopped(err)) return;
        failed = true;
      }
    }
    status.value = failed ? "pending" : "synced";
  }

  // The sign-in and offline states shared by a push and a Sync all. True when the error was one of them.
  function stopped(err) {
    if (!(err instanceof SyncError)) return false;
    if (err.code === "unreachable") status.value = "offline";
    else if (err.code === "signin") {
      status.value = "signin";
      error.value = "This device was signed out. Paste a new invite link to start syncing again.";
    } else return false;
    return true;
  }

  // Sync all: both ways, for every draft (see createSyncer). One at a time, after any push that is already going.
  function syncAll() {
    chain = chain.then(async () => {
      if (!device || status.value === "signin") return;
      error.value = "";
      status.value = "syncing";
      try {
        await prepare();
        const sum = await createSyncer({ device, drafts, fetchFn }).all({ skip: skip() });
        summary.value = summaryText(sum);
        lastSync.value = Date.now();
        status.value = sum.failed ? "pending" : "synced";
        if (notice.value?.kind === "newer" && !sum.failed && !sum.skipped) notice.value = null;
        if (sum.downloaded || sum.removed || sum.conflicted) onChanged();
      } catch (err) {
        if (!stopped(err)) {
          status.value = "pending";
          error.value = "Sync did not finish. Try again.";
        }
      }
    });
    return chain;
  }

  // Call when a draft was opened (its text is already on screen). In the background the server is asked whether it holds something
  // different. `canSwap()` says whether nothing has been typed since; `onSwapped()` shows the draft again after a newer one was stored. An
  // error shows nothing: the local text stays (docs/sync.md, "When sync happens"). Only a refused device changes the chip.
  function noteOpened(id, { canSwap = () => true, onSwapped = () => {} } = {}) {
    clearTimeout(noticeTimer);
    notice.value = null;
    if (!device || status.value === "signin") return Promise.resolve();
    chain = chain.then(async () => {
      if (!device) return;
      try {
        const out = await createSyncer({ device, drafts, fetchFn }).open(id, { canSwap });
        // The server answered, so it is reachable again; drafts saved while it was not are still unsent until the next save or Sync all.
        if (status.value === "offline") status.value = "pending";
        if (out === "updated") {
          onSwapped();
          notice.value = { id, kind: "updated", text: "Updated from the server" };
          noticeTimer = setTimeout(() => (notice.value = null), 5000);
        } else if (out === "newer") {
          notice.value = { id, kind: "newer", text: "Newer on the server" };
        }
      } catch (err) {
        if (err instanceof SyncError && err.code === "signin") stopped(err);
      }
    });
    return chain;
  }

  // Call after a draft was saved. It is pushed once typing has stopped for `delay`; a failure leaves it unsynced, which the next save
  // retries (the draft is "changed" until the server has its hash). A save that finds the server changed is settled by the same rules as Sync all.
  function draftSaved(id) {
    if (!device || status.value === "signin") return;
    waiting.add(id);
    clearTimeout(timer);
    timer = setTimeout(() => {
      chain = chain.then(run);
    }, delay);
  }

  return { configured, status, error, info, enrolled, summary, lastSync, notice, init, enroll, turnOff, draftSaved, noteOpened, syncAll };
}
