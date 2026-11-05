import { computed, ref } from "vue";
import { templateText } from "./templates.js";
import {
  deleteDraft,
  getDraft,
  isWeb,
  listDrafts,
  startFresh as moveDatabaseAside,
  saveDraft,
  saveDraftToFile,
  searchDrafts,
} from "./backend.js";

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
export function useDrafts(editor, drawerOpen, { onSaved, onOpened, onDeleted } = {}) {
  const current = ref({ id: "", createdAt: 0, format: "markdown", filePath: "" });
  const state = ref("idle"); // idle | dirty | saving | saved | error
  const error = ref("");
  const list = ref({ drafts: [], total: 0 });
  const query = ref("");
  const toast = ref(null); // { message, undo } while the "Draft deleted" bar is showing
  const available = ref(true); // false when the database cannot be opened: the editor still works, nothing is saved

  const home = ref(""); // the user's home folder, from the backend
  const fileState = ref("none"); // none | unknown (linked, not written in this session) | synced | stale (edited since the file was written)

  let overwriteOk = false; // set after a save was refused because the file changed outside the app: the next save replaces it
  let dirty = false;
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
      if (fileState.value === "synced") return `Saved to ${fileName.value}`;
      if (fileState.value === "stale") return `Draft saved, ${fileName.value} not updated (Ctrl+S)`;
      if (fileState.value === "unknown") return `Saved, file: ${fileName.value}`;
      return "Saved";
    }
    return "";
  });

  const asCurrent = (d) => ({ id: d.id, createdAt: d.createdAt, format: d.format, filePath: d.filePath ?? "" });

  function setCurrent(d) {
    current.value = asCurrent(d);
    fileState.value = current.value.filePath ? "unknown" : "none";
    overwriteOk = false;
    dirty = false;
    state.value = d.id ? "saved" : "idle";
  }

  // Called after every change the user makes to the text.
  function edited() {
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
    state.value = "saving";
    try {
      const d = await saveDraft({
        id: current.value.id,
        format: current.value.format,
        content: text,
        createdAt: current.value.createdAt,
      });
      current.value = asCurrent(d);
      if (edits === mine) {
        dirty = false;
        state.value = "saved";
      } else {
        state.value = "dirty"; // typed during the save: its own timer is already running
      }
      refreshListSoon();
      onSaved?.(d.id);
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
  function saveFile(saveAs = false) {
    if (!available.value) return Promise.resolve();
    if (!saveAs && !current.value.filePath) {
      // Save on a draft with no file: the draft is saved already (autosave); the request still asks for a sync now.
      return flush().then(() => current.value.id && onSaved?.(current.value.id, { explicit: true }));
    }
    chain = chain.then(() => writeFile(saveAs));
    return chain;
  }

  async function writeFile(saveAs) {
    const text = editor.value?.getText() ?? "";
    if (!current.value.id && text.trim() === "") return;
    const mine = edits;
    const before = state.value;
    state.value = "saving";
    try {
      const r = await saveDraftToFile(
        {
          id: current.value.id,
          format: current.value.format,
          content: text,
          createdAt: current.value.createdAt,
          filePath: current.value.filePath,
        },
        saveAs,
        overwriteOk && !saveAs,
      );
      overwriteOk = false;
      if (r.conflict) {
        // The draft is saved, the file is not: say so, and let the next Ctrl+S replace the file.
        current.value = asCurrent(r.draft);
        fileState.value = "stale";
        overwriteOk = true;
        error.value = `${fileName.value} was changed outside Harper Pad. Ctrl+S again replaces it, Ctrl+Shift+S saves elsewhere.`;
        if (edits === mine) dirty = false;
        state.value = "error";
        onSaved?.(current.value.id, { explicit: true }); // the draft itself was saved
        return;
      }
      if (r.cancelled) {
        state.value = before === "saving" ? "saved" : before;
        return;
      }
      current.value = asCurrent(r.draft);
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
      onSaved?.(current.value.id, { explicit: true });
    } catch (err) {
      error.value = `Not saved to a file: ${message(err)}`;
      state.value = "error"; // the text stays dirty, so the next edit or flush tries again
      dirty = true;
    }
  }

  async function refreshList() {
    if (!available.value) return;
    const seq = ++listSeq;
    const q = query.value.trim();
    try {
      const res = q ? await searchDrafts(q, shown) : await listDrafts(shown, 0);
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
      await moveDatabaseAside();
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
      const d = await getDraft(id);
      setCurrent(d);
      editor.value?.load(d.content, d.format);
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
    const d = await getDraft(current.value.id);
    setCurrent(d);
    editor.value?.load(d.content, d.format);
  }

  // A new, empty draft, or one that starts from a template (see lib/templates.js). The template text is not saved until it is edited,
  // so choosing one and walking away leaves no draft behind.
  async function create(template = "empty") {
    await flush();
    const text = templateText(template);
    if (!text && !current.value.id && (editor.value?.getText() ?? "").trim() === "") {
      editor.value?.focus();
      return;
    }
    setCurrent({ id: "", createdAt: 0, format: "markdown", filePath: "" });
    editor.value?.load(text, "markdown");
    if (text) editor.value?.focusEnd();
  }

  // Delete a draft, with an undo that puts it back exactly as it was (same id, text and creation time).
  async function remove(id) {
    let draft;
    try {
      draft = await getDraft(id);
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
      await deleteDraft(id);
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
          await saveDraft(draft);
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
      const newest = (await listDrafts(1, 0)).drafts[0];
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
      await saveDraft(draft);
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
  };
  function attach() {
    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onLeave);
    document.addEventListener("visibilitychange", onVisibility);
  }
  function detach() {
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("pagehide", onLeave);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const t of [timer, listTimer, searchTimer, toastTimer]) clearTimeout(t);
  }

  return {
    current,
    status,
    state,
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
