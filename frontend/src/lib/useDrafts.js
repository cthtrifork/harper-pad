import { computed, ref } from "vue";
import { deleteDraft, getDraft, listDrafts, saveDraft, searchDrafts } from "./backend.js";

// How long after the last keystroke the draft is saved (the 300 ms lint is separate). Kept short: a reload before the save has
// started loses the text, because the flush on pagehide cannot finish writing to IndexedDB while the page is going away.
const SAVE_DELAY_MS = 100;
const SEARCH_DELAY_MS = 200;
const PAGE = 50; // drafts shown at first, and added by "Show more"
const TOAST_MS = 8000;

const message = (err) => String(err?.message || err);

// The drafts the app keeps for you: which one is open, saving it as you type, and the list in the drawer. `editor` is a ref
// to the Editor component (getText, load), `drawerOpen` a ref that says whether the list is on screen (it is only fetched
// then, because each fetch reads every listed draft).
//
// A draft is created by the first save, so an empty editor never leaves an empty draft behind. Saves run one after another,
// and a save never covers text typed while it was running: that text gets its own save.
export function useDrafts(editor, drawerOpen) {
  const current = ref({ id: "", createdAt: 0, format: "markdown" });
  const state = ref("idle"); // idle | dirty | saving | saved | error
  const error = ref("");
  const list = ref({ drafts: [], total: 0 });
  const query = ref("");
  const toast = ref(null); // { message, undo } while the "Draft deleted" bar is showing
  const available = ref(true); // false when the database cannot be opened: the editor still works, nothing is saved

  let dirty = false;
  let edits = 0;
  let timer = null;
  let chain = Promise.resolve();
  let shown = PAGE;
  let listSeq = 0;
  let listTimer = null;
  let searchTimer = null;
  let toastTimer = null;

  const status = computed(() => {
    if (state.value === "error") return error.value;
    if (state.value === "saving") return "Saving...";
    if (state.value === "dirty") return "Unsaved changes";
    if (state.value === "saved") return "Saved";
    return "";
  });

  function setCurrent(d) {
    current.value = { id: d.id, createdAt: d.createdAt, format: d.format };
    dirty = false;
    state.value = d.id ? "saved" : "idle";
  }

  // Called after every change the user makes to the text.
  function edited() {
    if (!available.value) return;
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
      current.value = { id: d.id, createdAt: d.createdAt, format: d.format };
      if (edits === mine) {
        dirty = false;
        state.value = "saved";
      } else {
        state.value = "dirty"; // typed during the save: its own timer is already running
      }
      refreshListSoon();
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

  function showToast(text, undo = null) {
    toast.value = { message: text, undo };
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toast.value = null), TOAST_MS);
  }

  function dismissToast() {
    clearTimeout(toastTimer);
    toast.value = null;
  }

  // Start from what PadService.Startup returned: open the most recent draft, or return `fallback` (the text of a new, unsaved
  // draft) when there are none. It is one call to the Go side, so the editor does not wait for several round trips. The list
  // is not part of it: it is fetched when the drawer opens, because listing reads every draft it shows.
  function init(start, fallback = "") {
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

  async function open(id) {
    if (id === current.value.id) return;
    await flush();
    try {
      const d = await getDraft(id);
      setCurrent(d);
      editor.value?.load(d.content);
    } catch (err) {
      showToast(`Could not open the draft: ${message(err)}`);
      refreshList();
    }
  }

  async function create() {
    await flush();
    if (!current.value.id && (editor.value?.getText() ?? "").trim() === "") {
      editor.value?.focus();
      return;
    }
    setCurrent({ id: "", createdAt: 0, format: "markdown" });
    editor.value?.load("");
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
        setCurrent({ id: "", createdAt: 0, format: "markdown" });
        editor.value?.load("");
      }
    }
    showToast("Draft deleted", async () => {
      try {
        await saveDraft(draft);
      } catch (err) {
        showToast(`Could not restore the draft: ${message(err)}`);
        return;
      }
      await refreshList();
      // Going back to it only when nothing else is being written: an unsaved or changed draft is never replaced.
      if (wasOpen && !dirty && !current.value.id) await open(draft.id);
    });
  }

  async function undo() {
    const t = toast.value;
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
    list,
    query,
    toast,
    available,
    init,
    edited,
    flush,
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
