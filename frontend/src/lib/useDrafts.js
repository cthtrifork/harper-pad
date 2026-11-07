import { computed, ref, watch } from "vue";
import * as backend from "./backend.ts";

const { isWeb } = backend;
import { createFileChange } from "./fileChange.ts";
import { saveLastOpened } from "./lastOpened.ts";

// Kept short: the flush on pagehide cannot finish writing to IndexedDB, so a reload before the save has started loses the text.
const SAVE_DELAY_MS = 100;
const SEARCH_DELAY_MS = 200;
const PAGE = 50; // drafts shown at first, and added by "Show more"
const TOAST_MS = 8000;

const message = (err) => String(err?.message || err);

// The open draft, its autosave and the drawer list. `editor` is a ref to the Editor component, `drawerOpen` says whether the list is
// on screen (it is only fetched then, because each fetch reads every listed draft).
//
// A draft can also be saved to a file (Ctrl+Shift+S, then Ctrl+S). That only happens on request, never by the autosave.
// A draft is created by its first save, so an empty editor leaves none behind.
export function useDrafts(editor, drawerOpen, { onSaved, onOpened, onDeleted, probeServer } = {}, api = {}) {
  const be = { ...backend, ...api }; // `api` replaces backend functions in tests
  const current = ref({ id: "", createdAt: 0, format: "markdown", filePath: "" });
  const state = ref("idle"); // idle | dirty | saving | saved | error
  const error = ref("");
  const list = ref({ drafts: [], total: 0 });
  const query = ref("");
  const toast = ref(null); // { message, undo } while the "Draft deleted" bar is showing
  const available = ref(true); // false when the database cannot be opened: the editor still works, nothing is saved

  const home = ref(""); // the user's home folder, from the backend
  const fileState = ref("none"); // none | unknown (linked, not written in this session) | synced | stale (edited since the file was written)

  // The linked file no longer matches the draft. Looked at when a draft is opened and when the window comes back, and raised by a save that
  // found it; a real conflict stays (ConflictDialog.vue) until the person chooses Keep or Overwrite. A draft with no edits of its own takes the
  // file's text quietly, unless the server also holds something else: then the dialog asks, with the file's text as "yours".
  const fileChange = createFileChange((id) => be.linkedFileStatus(id), {
    can: () => canAutoRefresh(),
    run: async (draft, name) => {
      let ahead = null;
      try {
        ahead = await probeServer?.(draft.id); // one conditional request; null when sync is off or the server cannot be reached
      } catch {
        ahead = null;
      }
      if (ahead?.ahead) {
        const f = await be.linkedFileText(draft.id).catch(() => null);
        if (!f || ahead.text === f.text) return; // the server already holds the file's text: nothing more to do here
        fileChange.raiseClean(draft, { stamp: f.stamp, serverText: ahead.text });
        return;
      }
      return reloadFromFile({ auto: name });
    },
  });
  // The "Conflicted copy" labels: draft id -> "file" | "server" | "file and server", only in memory. Nothing is saved or synced: not the text, not
  // the database. A label goes when its draft is edited or deleted, from its x, or when the app restarts.
  const copies = /** @type {import("vue").Ref<Record<string, string>>} */ (ref({}));
  const linkMoved = /** @type {import("vue").Ref<{ text: string; tick: number } | null>} */ (ref(null)); // Save as took a file from another draft
  const fileNameOf = (p) => String(p).split(/[\\/]/).pop();
  const recreated = ref(false); // the last write recreated a file that was gone
  const dropCopy = (id) => {
    if (copies.value[id]) {
      const { [id]: _gone, ...rest } = copies.value;
      copies.value = rest;
    }
  };
  let checkDone = Promise.resolve(); // the look at the file of the draft just opened: sync waits for it, so the two never race
  const refreshed = /** @type {import("vue").Ref<{ name: string; tick: number } | null>} */ (ref(null)); // while the "Updated from <file>" toast shows
  let dirty = false;
  let quietSave = false; // set while the draft takes the file's text: the caller says to sync (or not), so the save does not
  let stored = null; // {text, format} the saved draft holds, so a save that would change nothing is skipped and the timestamp stays
  let edits = 0;
  let timer = null;
  let chain = Promise.resolve();
  let shown = PAGE;
  let listSeq = 0;
  let listTimer = null;
  let searchTimer = null;
  let toastTimer = null;

  const fileName = computed(() => current.value.filePath.split(/[\\/]/).pop());
  // The folder of the file, with the home folder shown as "~" ("" in the web build, which only knows the name).
  const fileDir = computed(() => {
    const p = current.value.filePath;
    const i = Math.max(p.lastIndexOf("/"), p.lastIndexOf("\\"));
    const dir = i > 0 ? p.slice(0, i) : "";
    const h = home.value.replace(/[\\/]+$/, "");
    return h && (dir === h || dir.startsWith(`${h}/`) || dir.startsWith(`${h}\\`)) ? `~${dir.slice(h.length)}` : dir;
  });

  const status = computed(() => {
    if (state.value === "error") return error.value;
    if (state.value === "saving") return "Saving...";
    if (state.value === "dirty") return "Unsaved changes";
    if (state.value === "saved") {
      if (recreated.value && fileState.value === "synced") return `Recreated ${fileName.value}`;
      if (fileState.value === "synced") return `Saved to ${fileName.value}`;
      if (fileState.value === "stale") return `Draft saved, ${fileName.value} not updated (Ctrl+S)`;
      if (fileState.value === "unknown") return `Saved, file: ${fileName.value}`;
      return "Saved";
    }
    return "";
  });

  // Whether Save (sync off) has anything to do: unsaved text, a failed save, or a file the draft has moved on from. The button is disabled
  // when this is false, which is how it shows there is nothing to save.
  const needsSave = computed(
    () =>
      ["dirty", "saving", "error"].includes(state.value) ||
      (!!current.value.filePath && (fileState.value === "stale" || !!fileChange.problem.value)),
  );

  // Remember the open draft on this device, so a reload or relaunch shows it (a new draft counts once its first save gives it an id).
  watch(
    () => current.value.id,
    (id) => id && saveLastOpened(id),
    { immediate: true, flush: "sync" },
  );

  const asCurrent = (d) => ({ id: d.id, createdAt: d.createdAt, updatedAt: d.updatedAt, format: d.format, filePath: d.filePath ?? "" });

  function setCurrent(d) {
    refreshed.value = null;
    unlinkedToast.value = null;
    current.value = asCurrent(d);
    fileState.value = current.value.filePath ? "unknown" : "none";
    dirty = false;
    stored = d.id && typeof d.content === "string" ? { text: d.content, format: d.format } : null;
    state.value = d.id ? "saved" : "idle";
    checkDone = fileChange.check(current.value); // also clears the dialog of the draft that was open
  }

  // Called after every change the user makes to the text.
  function edited() {
    refreshed.value = null; // the Undo offer is for the refresh alone, not for text typed after it
    recreated.value = false;
    dropCopy(current.value.id); // a Conflicted copy that is edited is an ordinary draft
    if (!available.value) return;
    dirty = true;
    edits++;
    if (current.value.filePath) fileState.value = "stale";
    if (state.value !== "saving") state.value = "dirty";
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  // Switch the open draft between "markdown" and "text". It is saved with the draft (the text is unchanged, so this counts as an
  // edit only for the autosave: the file, if any, is not stale because of it).
  function setFormat(format) {
    if (format === current.value.format) return;
    current.value = { ...current.value, format };
    if (!available.value || !current.value.id) return; // an unsaved draft carries it into its first save
    dirty = true;
    edits++;
    if (state.value !== "saving") state.value = "dirty";
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_DELAY_MS);
  }

  async function saveNow() {
    if (!dirty || !available.value) return;
    const text = editor.value?.getText() ?? "";
    const mine = edits;
    if (!current.value.id && text.trim() === "") {
      dirty = false;
      state.value = "idle";
      return;
    }
    // Typing something and then undoing it leaves the text as it was stored: writing it again would only move the draft's timestamp
    // (and so its place in the list, and past the server's copy) without changing anything.
    if (current.value.id && stored && stored.text === text && stored.format === current.value.format) {
      dirty = false;
      state.value = "saved";
      return;
    }
    state.value = "saving";
    try {
      const d = await be.saveDraft({
        id: current.value.id,
        format: current.value.format,
        content: text,
        createdAt: current.value.createdAt,
      });
      stored = { text: d.content ?? text, format: d.format };
      current.value = asCurrent(d);
      if (edits === mine) {
        dirty = false;
        state.value = "saved";
      } else {
        state.value = "dirty"; // typed during the save: its own timer is already running
      }
      refreshListSoon();
      if (!quietSave) onSaved?.(d.id);
    } catch (err) {
      error.value = `Not saved: ${message(err)}`;
      state.value = "error"; // the text stays dirty, so the next edit or flush tries again
    }
  }

  // Save now if there is anything unsaved. Safe to call at any time, and resolves when the save has finished.
  function flush() {
    clearTimeout(timer);
    timer = null;
    chain = chain.then(saveNow);
    return chain;
  }

  // Write the text to its file, and save the draft with it. With `saveAs`, or when the draft has no file yet, the user picks the file;
  // when they cancel nothing changes. A draft that has never been saved to a file only gets its draft saved (Ctrl+S).
  // This is Sync (Ctrl+S): it saves the draft, writes the linked file only if the draft changed since the file was written (an untouched
  // file keeps its modified time), and always asks sync to look at the server (`onSaved` with `explicit`).
  function saveFile(saveAs = false) {
    if (!available.value) return Promise.resolve();
    // A file that cannot be used right now (gone, no permission) is written again by every Ctrl+S, whatever the draft's state.
    if (!saveAs && !(current.value.filePath && (fileState.value === "stale" || fileChange.problem.value))) {
      return flush().then(async () => {
        // An untouched draft does not write its file, unless the file is gone or unusable: then Ctrl+S writes it again.
        if (current.value.filePath && !isWeb && (await fileGone())) {
          chain = chain.then(() => writeFile(false));
          return chain;
        }
        return current.value.id && onSaved?.(current.value.id, { explicit: true });
      });
    }
    chain = chain.then(() => writeFile(saveAs));
    return chain;
  }

  // True when the draft's file is gone or cannot be used at all (not a bar's business: Ctrl+S just writes it again).
  async function fileGone() {
    try {
      const st = await be.linkedFileStatus(current.value.id);
      return st.state === "missing" || st.state === "broken";
    } catch {
      return false;
    }
  }

  // "Overwrite file" in the toast: write the draft to its file even though something else changed it. The path is the stored one.
  function overwriteFile() {
    fileChange.clear();
    if (!available.value || !current.value.filePath) return Promise.resolve("");
    chain = chain.then(() => writeFile(false, true, false));
    return chain;
  }

  // The operations the Keep or Overwrite dialog needs (useConflict.ts).
  const dialog = {
    // The file's text and version stamp.
    fileText: () => be.linkedFileText(current.value.id),
    // The file's version stamp when it differs from the draft, else null.
    async fileStamp() {
      const st = await be.linkedFileStatus(current.value.id);
      return st.state === "changed" ? st.stamp : null;
    },
    // A new, ordinary, unlinked draft; labelled "Conflicted copy" in memory only. Returns its id.
    async saveCopy(text, from) {
      const d = await be.saveDraft({ format: current.value.format, content: text });
      copies.value = { ...copies.value, [d.id]: from };
      refreshListSoon();
      onSaved?.(d.id);
      return d.id;
    },
    // Write the draft's text to its file (never the autosave's job). Rejects with the reason.
    async writeFile() {
      await flush();
      const why = await (chain = chain.then(() => writeFile(false, true, false)));
      if (why) throw new Error(why);
    },
    // The draft takes the file's text (it has no edits of its own), without pushing: the dialog pushes.
    applyFile: () => reloadFromFile({ push: false }),
    current: () => ({ id: current.value.id, text: editor.value?.getText() ?? "", updatedAt: current.value.updatedAt }),
  };

  // "Reload from file" in the toast: the draft's text becomes the file's text, as one edit that Ctrl+Z takes back. Go reads the stored path and
  // makes the file the baseline, so the next save does not report it again.
  // `auto` (the file's name) is the quiet refresh of a draft with no edits of its own: it runs only if nothing is unsaved, being typed or
  // saved, before and after the file is read, and shows the "Updated from" toast.
  function reloadFromFile({ auto = "", push = true } = {}) {
    const id = current.value.id;
    if (!auto) fileChange.clear();
    if (!available.value || !id || !current.value.filePath) return Promise.resolve();
    const startEdits = edits;
    chain = chain.then(async () => {
      try {
        if (auto && (edits !== startEdits || !canAutoRefresh())) return; // the next look tries again
        const f = await be.linkedFileText(id);
        if (current.value.id !== id) return; // another draft was opened meanwhile
        // Typing began while the file was read: nothing is applied (the editor keeps the typed text) and the next look tries again.
        if (auto && (edits !== startEdits || !canAutoRefresh())) return;
        editor.value?.replaceText(f.text); // one edit that Ctrl+Z takes back; it reports an edit, which the draft's own update settles below
        clearTimeout(timer);
        timer = null;
        quietSave = true;
        try {
          await saveNow(); // the normal update of the draft (not through the chain: this already runs in it)
        } finally {
          quietSave = false;
        }
        await be.recordLinkedFile(id, f.stamp).catch(() => {}); // the file is the baseline now; if it changed again, the next look finds that
        fileState.value = "synced";
        state.value = "saved";
        if (auto) refreshed.value = { name: auto, tick: Date.now() };
        refreshListSoon();
        if (push) onSaved?.(id, { explicit: true }); // the draft changed to match the file: push it at once, like Ctrl+S, so no other device pulls stale text
      } catch (err) {
        error.value = `Could not read ${fileName.value}: ${message(err)}`;
        state.value = "error";
      }
    });
    return chain;
  }

  // Nothing unsaved, no save running, no IME composition: the editor's text is what is stored, so it may be replaced.
  function canAutoRefresh() {
    return !!editor.value && !dirty && !timer && state.value !== "saving" && state.value !== "dirty" && !editor.value.composing();
  }

  // Undo on the "Updated from" toast: the editor's own undo, which brings the old text back; edited() then notices and marks the file as differing.
  function undoRefresh() {
    refreshed.value = null;
    editor.value?.undo();
  }

  // "Unlink" (the unlink button on the file chip): the draft stays, the file stays, the link goes. A toast offers Undo, which puts the link back as it was.
  const unlinkedToast = /** @type {import("vue").Ref<{ id: string; name: string; tick: number } | null>} */ (ref(null));
  function unlinkFile() {
    const id = current.value.id;
    const name = fileName.value;
    fileChange.clear();
    if (!available.value || !id || isWeb) return Promise.resolve();
    chain = chain.then(async () => {
      try {
        const d = await be.unlinkDraftFile(id);
        if (current.value.id !== id) return;
        current.value = asCurrent(d);
        fileState.value = "none";
        unlinkedToast.value = { id, name, tick: Date.now() };
        refreshListSoon();
      } catch (err) {
        error.value = `Could not unlink: ${message(err)}`;
        state.value = "error";
      }
    });
    return chain;
  }

  // Undo of "Unlinked": the same file and baseline again. Does nothing if another draft was opened meanwhile.
  function undoUnlink() {
    const t = unlinkedToast.value;
    unlinkedToast.value = null;
    if (!t || !available.value) return Promise.resolve();
    chain = chain.then(async () => {
      try {
        const d = await be.undoUnlinkDraftFile(t.id);
        if (current.value.id === t.id) {
          current.value = asCurrent(d);
          fileState.value = d.filePath ? "unknown" : "none";
          fileChange.check(current.value);
        }
        refreshListSoon();
      } catch (err) {
        error.value = `Could not restore the link: ${message(err)}`;
        state.value = "error";
      }
    });
    return chain;
  }

  // The window came back, or the app regained focus: the file may have changed meanwhile (nothing watches it). Only for the open linked draft,
  // at most every few seconds, and after unsaved text was saved so the comparison is with what is on screen.
  let lastCheck = 0;
  async function checkFile() {
    if (isWeb || !available.value || !current.value.id || !current.value.filePath) return;
    if (state.value === "saving" || Date.now() - lastCheck < 2000) return;
    lastCheck = Date.now();
    await flush();
    await chain;
    await fileChange.check(current.value);
  }

  // Resolves to "" or the reason the file was not written. `push` false: the caller sends the draft to the server itself (the conflict dialog).
  async function writeFile(saveAs, force = false, push = true) {
    const text = editor.value?.getText() ?? "";
    if (!current.value.id && text.trim() === "") return "";
    const mine = edits;
    const wasGone = fileChange.problem.value?.reason === "file not found";
    const before = state.value;
    state.value = "saving";
    try {
      const r = await be.saveDraftToFile(
        {
          id: current.value.id,
          format: current.value.format,
          content: text,
          createdAt: current.value.createdAt,
          filePath: current.value.filePath,
        },
        saveAs,
        force && !saveAs,
      );
      if (r.conflict) {
        // The draft is saved, the file is not: the notice asks what to do with the file.
        current.value = asCurrent(r.draft);
        fileState.value = "stale";
        if (edits === mine) dirty = false;
        state.value = edits === mine ? "saved" : "dirty";
        fileChange.raise(current.value);
        if (push) onSaved?.(current.value.id, { explicit: true }); // the draft itself was saved
        return "";
      }
      if (r.cancelled) {
        state.value = before === "saving" ? "saved" : before;
        return "";
      }
      stored = { text: r.draft.content ?? text, format: r.draft.format };
      current.value = asCurrent(r.draft);
      fileChange.clear(); // the file was just written (or replaced by a new one)
      recreated.value = wasGone && !saveAs;
      if (r.unlinkedFrom?.length)
        linkMoved.value = {
          text: `${fileNameOf(r.draft.filePath)} now belongs to this draft, no longer to "${r.unlinkedFrom.join('", "')}"`,
          tick: Date.now(),
        };
      if (!current.value.filePath) {
        // The browser could only download a copy: the draft is saved, but not linked to a file.
        fileState.value = "none";
      } else {
        fileState.value = edits === mine ? "synced" : "stale";
      }
      if (edits === mine) {
        dirty = false;
        state.value = "saved";
      } else {
        state.value = "dirty"; // typed during the save: its own timer is already running
      }
      refreshListSoon();
      if (push) onSaved?.(current.value.id, { explicit: true });
      return "";
    } catch (err) {
      if (!saveAs) fileChange.failed(current.value, message(err)); // the header's chip says why; the link stays
      error.value = `Not saved to a file: ${message(err)}`;
      state.value = "error"; // the text stays dirty, so the next edit or flush tries again
      dirty = true;
      // The draft itself was stored before the file failed or was refused, so Ctrl+S still asks sync to look at the server.
      if (push && !saveAs && current.value.id) onSaved?.(current.value.id, { explicit: true });
      return message(err);
    }
  }

  async function refreshList() {
    if (!available.value) return;
    const seq = ++listSeq;
    const q = query.value.trim();
    try {
      const res = q ? await be.searchDrafts(q, shown) : await be.listDrafts(shown, 0);
      if (seq === listSeq) list.value = res;
    } catch (err) {
      showToast(`Could not read the drafts: ${message(err)}`);
    }
  }

  function refreshListSoon() {
    if (!drawerOpen.value) return;
    clearTimeout(listTimer);
    listTimer = setTimeout(refreshList, 300);
  }

  function setQuery(q) {
    query.value = q;
    shown = PAGE;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(refreshList, SEARCH_DELAY_MS);
  }

  function showMore() {
    shown = Math.min(shown + PAGE, 500);
    refreshList();
  }

  // A draft that was deleted here while its Undo is still on offer. When the offer ends (it times out, is closed, or another toast takes its
  // place) without Undo, the delete is final and `onDeleted(id)` lets sync send the tombstone.
  let pendingDelete = "";
  function commitDelete() {
    const id = pendingDelete;
    pendingDelete = "";
    if (id) onDeleted?.(id);
  }
  function showToast(text, undo = null, { deleted = "" } = {}) {
    commitDelete(); // the offer this one replaces has ended
    pendingDelete = deleted;
    toast.value = { message: text, undo };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.value = null;
      commitDelete();
    }, TOAST_MS);
  }

  function dismissToast() {
    clearTimeout(toastTimer);
    toast.value = null;
    commitDelete();
  }

  // Start from what PadService.Startup returned: open the most recent draft, or return `fallback` (the text of a new, unsaved
  // draft) when there are none. It is one call to the Go side, so the editor does not wait for several round trips. The list
  // is not part of it: it is fetched when the drawer opens, because listing reads every draft it shows.
  function init(start, fallback = "") {
    home.value = start.home ?? "";
    list.value = { drafts: [], total: start.total ?? 0 };
    if (start.error) {
      available.value = false;
      error.value = `Drafts are unavailable: ${start.error}`;
      state.value = "error";
      return fallback;
    }
    if (start.open) {
      setCurrent(start.open);
      return start.open.content;
    }
    return fallback;
  }

  // For when drafts are unavailable: move the database aside and start a new one. Whatever is in the editor stays and is saved into
  // the new database; the old file is kept next to it. Desktop only (`canStartFresh`).
  const canStartFresh = computed(() => !isWeb && !available.value);
  async function startFresh() {
    try {
      await be.startFresh();
    } catch (err) {
      error.value = `Could not start fresh: ${message(err)}`;
      return;
    }
    available.value = true;
    error.value = "";
    setCurrent({ id: "", createdAt: 0, format: "markdown" });
    list.value = { drafts: [], total: 0 };
    state.value = "idle";
    if ((editor.value?.getText() ?? "").trim() !== "") edited(); // the text in the editor becomes the first draft
  }

  async function open(id) {
    if (id === current.value.id) return;
    await flush();
    try {
      const d = await be.getDraft(id);
      setCurrent(d);
      editor.value?.load(d.content, d.format);
      await checkDone;
      onOpened?.(d.id);
    } catch (err) {
      showToast(`Could not open the draft: ${message(err)}`);
      refreshList();
    }
  }

  // True when nothing is unsaved or being saved, so the stored draft may replace what the editor shows.
  const canReplace = () => !dirty && state.value !== "saving";

  // Shows the stored version of the open draft again (a newer one was stored by sync). Does nothing if something was typed meanwhile.
  async function reloadCurrent() {
    if (!current.value.id || !canReplace()) return;
    const d = await be.getDraft(current.value.id);
    const was = stored?.text;
    setCurrent(d);
    // Newer text from the server: the linked file now lags the draft, so the next Ctrl+S writes it (and asks first if the file changed).
    if (current.value.filePath && was !== d.content) fileState.value = "stale";
    editor.value?.load(d.content, d.format, true); // same draft, newer text: the person's selection stays
  }

  async function create() {
    await flush();
    if (!current.value.id && (editor.value?.getText() ?? "").trim() === "") {
      editor.value?.focus();
      return;
    }
    setCurrent({ id: "", createdAt: 0, format: "markdown", filePath: "" });
    editor.value?.load("", "markdown");
  }

  // Delete a draft, with an undo that puts it back exactly as it was (same id, text and creation time).
  async function remove(id) {
    let draft;
    try {
      draft = await be.getDraft(id);
    } catch (err) {
      showToast(`Could not delete the draft: ${message(err)}`);
      refreshList();
      return;
    }
    const wasOpen = id === current.value.id;
    if (wasOpen) {
      // The open draft must not be saved again after it is gone.
      clearTimeout(timer);
      dirty = false;
      await chain;
    }
    try {
      await be.deleteDraft(id);
      dropCopy(id);
    } catch (err) {
      showToast(`Could not delete the draft: ${message(err)}`);
      return;
    }
    await refreshList();
    if (wasOpen) {
      const next = list.value.drafts[0];
      if (next) await open(next.id);
      else {
        setCurrent({ id: "", createdAt: 0, format: "markdown", filePath: "" });
        editor.value?.load("", "markdown");
      }
    }
    showToast(
      "Draft deleted",
      async () => {
        try {
          await be.saveDraft(draft);
        } catch (err) {
          showToast(`Could not restore the draft: ${message(err)}`);
          return;
        }
        await refreshList();
        // Going back to it only when nothing else is being written: an unsaved or changed draft is never replaced.
        if (wasOpen && !dirty && !current.value.id) await open(draft.id);
      },
      { deleted: id },
    );
  }

  // Sync removed the open draft because it was deleted on another device (the person chose Remove): show the newest draft that is left, or
  // an empty editor. The draft is not saved again. (The Undo for it sits beside the sync chip, see useSync, because the drawer is closed.)
  async function removedElsewhere(draft) {
    if (draft.id === current.value.id) {
      clearTimeout(timer);
      dirty = false;
      await chain;
      const newest = (await be.listDrafts(1, 0)).drafts[0];
      if (newest) await open(newest.id);
      else {
        setCurrent({ id: "", createdAt: 0, format: "markdown", filePath: "" });
        editor.value?.load("", "markdown");
      }
    }
    await refreshList();
  }

  // Undo of that removal: the draft comes back, is shown, and is uploaded again (an edit survives a delete).
  async function restore(draft) {
    try {
      await be.saveDraft(draft);
    } catch (err) {
      showToast(`Could not restore the draft: ${message(err)}`);
      return;
    }
    await refreshList();
    await open(draft.id);
    onSaved?.(draft.id);
  }

  async function undo() {
    const t = toast.value;
    pendingDelete = ""; // Undo: the delete is not final
    dismissToast();
    await t?.undo?.();
  }

  // Save what is unsaved when the window is about to go away or loses focus.
  const onLeave = () => {
    flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") flush();
    else checkFile();
  };
  function attach() {
    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onLeave);
    window.addEventListener("focus", checkFile);
    document.addEventListener("visibilitychange", onVisibility);
  }
  function detach() {
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("pagehide", onLeave);
    window.removeEventListener("focus", checkFile);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const t of [timer, listTimer, searchTimer, toastTimer]) clearTimeout(t);
  }

  return {
    current,
    status,
    state,
    fileState,
    needsSave,
    fileName,
    fileDir,
    list,
    query,
    toast,
    available,
    canStartFresh,
    startFresh,
    init,
    edited,
    setFormat,
    flush,
    canReplace,
    reloadCurrent,
    removedElsewhere,
    restore,
    saveFile,
    recreated,
    fileConflict: fileChange.conflict,
    fileCheckDone: () => checkDone,
    recheckFile: () => fileChange.check(current.value, { force: true }),
    clearFileConflict: fileChange.clearConflict,
    dialog,
    copies,
    dropCopy,
    linkMoved,
    // Why the open draft's file cannot be used right now ("file not found", "permission denied", ...), or "".
    fileProblem: computed(() => (fileChange.problem.value?.id === current.value.id ? fileChange.problem.value.reason : "")),
    refreshed,
    undoRefresh,
    reloadFromFile,
    overwriteFile,
    unlinkFile,
    unlinkedToast,
    undoUnlink,
    checkFile,
    refreshList,
    setQuery,
    showMore,
    open,
    create,
    remove,
    undo,
    dismissToast,
    attach,
    detach,
  };
}
