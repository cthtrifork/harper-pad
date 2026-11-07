import { computed, ref } from "vue";
import { summarize } from "./summarize.ts";
import { createSyncer, summaryText } from "./syncRun.ts";
import { parseInviteUrl, enrollDevice, SyncError } from "./syncEnroll.ts";

// How long after a save the draft is pushed (docs/sync.md, "When sync happens"): long enough that typing is one push, not many.
const PUSH_DELAY_MS = 2000;

// What the sync chip shows, and the work behind it: enrolling this device, pushing a draft after it is saved, and Sync all. Web build
// only for now; opening a note is a later step (docs/sync.md).
//
//   status: off | synced | syncing | pending | offline | signin
//
// `origin` is the sync server this build was made for (SYNC_ORIGIN, "" when none: then nothing shows). `deviceStore` is syncDevice from
// backend.ts and `drafts` the web store (see createSyncer: all syncing, conflicts included, is done there, not here). For Sync all: `prepare` saves what is typed first,
// `skip` returns the ids to leave alone (the open draft), `onChanged` is called when a run changed the local drafts, and `autoSync`
// runs it when the app starts and after enrolling. `settings` ({current(), store, apply(changes)}) syncs the personal dictionary and the ignored findings
// (hashes), with Sync all and after `wordsChanged()`; `current()` gives {words, ignored} now, `store` is settingsSync.ts's record and
// `apply` makes the local lists match the server's. `isOpen(id)` says whether a draft is the one in the editor (only that one raises the conflict dialog), and `onRemoved(draft)` is told when the person chose to remove a draft that was deleted on another device (it shows another note), and `onRestore(draft)` when they undo that.
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
  onRemoved = () => {},
  onRestore = () => {},
  settings = null,
  isOpen = () => true,
}) {
  const configured = !!origin && !!deviceStore && !!drafts;
  const status = ref("off");
  const error = ref(""); // the last message for the pop-up, "" when there is none
  const info = ref(null); // {server} while enrolled
  const summary = ref(""); // what the last Sync all did, "3 uploaded, 2 downloaded"
  const lastSync = ref(0); // when it finished, ms
  const gone = ref(null); // {id}: the open draft was deleted on another device and the person has not chosen yet
  const setsFailed = ref(false); // the dictionary and ignore list did not sync last time (not a draft's failure)
  const rejected = ref(null); // {id, title, reason}: the server refused this draft (too large, malformed); it stays here and is tried again
  const serverConflict = ref(null); // {id, text, format, stamp}: the open draft and the server hold different text, and the person has not chosen yet
  const notice = ref(null); // {id, kind: "updated" | "newer", text} about the open draft, or null
  const enrolled = computed(() => info.value !== null);

  let device = null;

  // One syncer for every path, so a conflict is announced the same way wherever it was found.
  const syncer = () => createSyncer({ device, drafts, fetchFn, onGone: (id) => (gone.value = { id }), onRejected: noteRejected });

  // The server refused a draft: the chip says which and why, with no dialog. The text stays local and goes again on the next push.
  async function noteRejected(id, reason) {
    const d = await drafts.get(id).catch(() => null);
    rejected.value = { id, title: d ? summarize(d.content).title : "the draft", reason };
  }

  // The open draft and the server hold different text: ask the server for its text so the dialog can show and copy it. Any other draft in
  // that state is left exactly as it is until it is opened (Sync all does not touch it and nothing is counted).
  async function raiseConflict(id) {
    if (!isOpen(id) || !device) return;
    try {
      const got = await syncer().inspect(id);
      if (got && !got.deleted && isOpen(id)) serverConflict.value = { id, ...got };
    } catch (err) {
      stopped(err);
    }
  }

  // The toast has ended. A "Newer on the server" marker is not a toast: it stays until a save or Sync all settles it.
  function clearNotice() {
    if (notice.value?.kind !== "newer") notice.value = null;
  }
  let timer = null;
  const waiting = new Set();
  let chain = Promise.resolve();

  async function init() {
    if (!configured) return;
    device = await deviceStore.load();
    info.value = device ? { server: device.server } : null;
    status.value = device ? "synced" : "off";
    if (device && autoSync) syncAll();
  }

  async function enroll(text) {
    error.value = "";
    try {
      // The page may only call the origin its policy names; an invite for another server would be blocked by the browser.
      if (parseInviteUrl(text).server !== origin) throw new SyncError("other-server", "This invite is for a different server.");
      await enrollDevice({ text, store: deviceStore, fetchFn });
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
    clearTimeout(wordsTimer);
    waiting.clear();
    setsFailed.value = false;
    notice.value = null;
    gone.value = null;
    rejected.value = null;
    await deviceStore.clear();
    await settings?.store.clear(); // enrolling again starts from the server's lists
    device = null;
    error.value = "";
    summary.value = "";
    await init();
  }

  async function run() {
    if (!device) return;
    const ids = [...waiting];
    waiting.clear();
    const engine = syncer();
    let failed = false;
    status.value = "syncing";
    for (const id of ids) {
      try {
        if (rejected.value?.id === id) rejected.value = null; // tried again now
        const out = await engine.one(id);
        if (out === "failed") failed = true;
        if (out === "conflict") {
          failed = true; // not in step with the server until the person chooses
          await raiseConflict(id);
        }
      } catch (err) {
        if (stopped(err)) return;
        if (err instanceof SyncError && err.code === "rejected") await noteRejected(id, err.message);
        failed = true;
      }
    }
    status.value = failed ? "pending" : "synced";
    // A "Newer on the server" marker goes only if the server no longer holds something newer: look again.
    const marked = notice.value;
    if (marked?.kind === "newer" && ids.includes(marked.id)) {
      notice.value = null;
      await checkOpen(marked.id);
    }
  }

  // The sign-in and offline states shared by a push and a Sync all. True when the error was one of them.
  function stopped(err) {
    if (!(err instanceof SyncError)) return false;
    if (err.code === "unreachable") status.value = "offline";
    else if (err.code === "signin") {
      status.value = "signin";
      error.value = "Signed out. Paste a new invite link.";
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
        const sum = await syncer().all({ skip: skip() });
        await syncSets();
        summary.value = summaryText(sum);
        lastSync.value = Date.now();
        status.value = sum.failed ? "pending" : "synced";
        if (notice.value?.kind === "newer" && !sum.failed && !sum.skipped) notice.value = null;
        if (sum.downloaded || sum.removed) onChanged();
      } catch (err) {
        if (!stopped(err)) {
          status.value = "pending";
          error.value = "Sync did not finish. Try again.";
        }
      }
    });
    return chain;
  }

  // The personal dictionary and the ignore list, by the same engine, as one document. A failure sets `setsFailed` (the chip says so)
  // and does not hold the drafts back. "unreachable" and "signin" are not theirs: they throw to the caller, as for a draft.
  async function syncSets() {
    if (!settings || settings.available?.() === false) return;
    try {
      await syncer().syncSettings(settings);
      setsFailed.value = false;
    } catch (err) {
      if (err instanceof SyncError && (err.code === "unreachable" || err.code === "signin")) throw err;
      setsFailed.value = true;
    }
  }

  // The dictionary or ignore list changed on this device: sync them once changes have stopped for `delay`.
  let wordsTimer = null;
  function wordsChanged() {
    if (!device || !settings || status.value === "signin") return;
    clearTimeout(wordsTimer);
    wordsTimer = setTimeout(() => {
      chain = chain.then(async () => {
        try {
          await syncSets();
        } catch (err) {
          stopped(err);
        }
      });
    }, delay);
  }

  // Call when a draft was opened (its text is already on screen). In the background the server is asked whether it holds something
  // different. `canSwap()` says whether nothing has been typed since; `onSwapped()` shows the draft again after a newer one was stored. An
  // error shows nothing: the local text stays (docs/sync.md, "When sync happens"). Only a refused device changes the chip.
  function noteOpened(id, { canSwap = () => true, onSwapped = () => {} } = {}) {
    notice.value = null;
    gone.value = null;
    serverConflict.value = null;
    openHooks = { canSwap, onSwapped };
    if (!device || status.value === "signin") return Promise.resolve();
    chain = chain.then(() => checkOpen(id));
    return chain;
  }

  // The hooks of the last opened note, so a push that finds its draft still marked can look again.
  let openHooks = {};

  // Asks the server about a draft that is open and shows what it found: a swap, a marker, or nothing. Runs inside the chain.
  async function checkOpen(id, { loud = false } = {}) {
    if (!device) return;
    const { canSwap = () => true, onSwapped = () => {} } = openHooks;
    try {
      const out = await syncer().open(id, { canSwap });
      // The server answered, so it is reachable again; drafts saved while it was not are still unsent until the next save or Sync all.
      if (status.value === "offline") status.value = "pending";
      if (out === "updated") {
        onSwapped();
        notice.value = { id, kind: "updated", text: "Updated from the server", at: Date.now() };
      } else if (out === "newer") {
        notice.value = { id, kind: "newer", text: "Newer on the server" };
      } else if (out === "deleted") {
        gone.value = { id };
      } else if (out === "conflict") {
        await raiseConflict(id);
      }
    } catch (err) {
      // Opening a note shows nothing for an unreachable server (the local text stays); a Sync the person asked for says so.
      if (loud || (err instanceof SyncError && err.code === "signin")) stopped(err);
    }
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

  // The person asked to save (Save, Ctrl+S, also to a file): push now, without the two-second wait, whether or not anything was typed. The
  // push looks at the server again afterwards (see run), so a "Newer on the server" marker can clear even when there was nothing to save.
  // `hooks` are noteOpened's.
  async function saveRequested(id, hooks) {
    if (!device || status.value === "signin") return;
    openHooks = hooks ?? openHooks;
    waiting.add(id);
    clearTimeout(timer);
    chain = chain.then(run);
    await chain;
  }

  // Sync (the button, Ctrl+S): push the draft if it changed, then ask the server about it whether or not anything was pushed, so a newer
  // version or a delete made on another device is found. The push alone would not: for a draft that is unchanged here it assumes the
  // server is unchanged too. Nothing is written locally unless the server had something newer (see checkOpen). `hooks` are noteOpened's.
  async function syncRequested(id, hooks) {
    if (!device || status.value === "signin") return;
    openHooks = hooks ?? openHooks;
    waiting.add(id);
    clearTimeout(timer);
    chain = chain.then(async () => {
      await run();
      if (status.value === "synced") await checkOpen(id, { loud: true });
    });
    await chain;
  }

  // The server's current text for a draft, for the conflict dialog and its check when the person chooses: {text, format, stamp, deleted}, null
  // when the server has nothing, false when there is no device or the server cannot be reached (so the dialog knows it could not look).
  async function inspectServer(id) {
    if (!device || status.value === "signin") return false;
    try {
      return await syncer().inspect(id);
    } catch (err) {
      stopped(err);
      return false;
    }
  }

  // Ask the server about the open draft now, so a conflict with it is known before the dialog is drawn for a conflict with a file.
  function checkNow(id) {
    if (!device || status.value === "signin") return Promise.resolve();
    chain = chain.then(() => checkOpen(id));
    return chain;
  }

  // Probe before an automatic refresh from a file: {ahead, text}, or null when sync is off or the server cannot be reached (then the file's text
  // is applied here and pushed later).
  async function probeServer(id) {
    if (!device || status.value === "signin") return null;
    try {
      return await syncer().probe(id);
    } catch (err) {
      stopped(err);
      return null;
    }
  }

  // Send this device's text to the server on top of what it holds (the person chose Keep or Overwrite). False when it did not go: the draft
  // stays pending and the chip says so.
  function forcePush(id) {
    if (!device || status.value === "signin") return Promise.resolve(false);
    status.value = "syncing";
    chain = chain.then(async () => {
      try {
        const ok = await syncer().force(id);
        status.value = ok ? "synced" : "pending";
        return ok;
      } catch (err) {
        if (!stopped(err)) status.value = "pending";
        return false;
      }
    });
    return chain;
  }

  const clearConflict = () => {
    serverConflict.value = null;
  };

  // The person's answer to "deleted elsewhere", asked in a modal dialog they cannot leave without choosing: keep the draft (it is uploaded
  // again), or remove it here too (`onRemoved` shows another note, and an Undo toast follows).
  function keepGone() {
    const g = gone.value;
    if (!g) return Promise.resolve();
    gone.value = null;
    status.value = "syncing";
    chain = chain.then(async () => {
      try {
        await syncer().keep(g.id);
        status.value = "synced";
      } catch (err) {
        if (!stopped(err)) status.value = "pending";
      }
    });
    return chain;
  }
  function removeGone() {
    const g = gone.value;
    if (!g) return Promise.resolve();
    gone.value = null;
    chain = chain.then(async () => {
      try {
        const removed = await syncer().removeLocal(g.id);
        if (removed) {
          await onRemoved(removed);
          // Undo is in the toast: the drafts drawer, where the usual Undo shows, is closed.
          notice.value = { id: removed.id, kind: "removed", text: "Removed", draft: removed, at: Date.now() };
        }
      } catch (err) {
        stopped(err);
      }
    });
    return chain;
  }
  // Undo of "Removed": the draft comes back and is uploaded again.
  function undoRemoved() {
    const n = notice.value;
    if (n?.kind !== "removed") return;
    notice.value = null;
    onRestore(n.draft);
  }

  // A draft was deleted and its Undo offer has ended: push the tombstone now (the same push as for a save; see createSyncer.one).
  const draftDeleted = (id) => saveRequested(id);

  return {
    configured,
    status,
    error,
    info,
    enrolled,
    summary,
    lastSync,
    notice,
    gone,
    serverConflict,
    rejected,
    inspectServer,
    checkNow,
    probeServer,
    forcePush,
    clearConflict,
    init,
    enroll,
    turnOff,
    draftSaved,
    draftDeleted,
    wordsChanged,
    setsFailed,
    saveRequested,
    syncRequested,
    noteOpened,
    keepGone,
    removeGone,
    clearNotice,
    undoRemoved,
    syncAll,
  };
}
