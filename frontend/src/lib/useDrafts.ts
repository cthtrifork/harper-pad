import { computed, type Ref, ref, watch } from "vue";
import type { List } from "../../bindings/github.com/cthtrifork/harper-pad/internal/store";
import * as backend from "./backend.ts";
import { createFileChange } from "./fileChange.ts";
import { saveLastOpened } from "./lastOpened.ts";
import {
  clearTitle,
  isProtected,
  isProtectedSummary,
  newDraftId,
  newSession,
  openWith,
  type Session,
  seal,
  unlock as unlockEnvelope,
} from "./protect.ts";

const { isWeb } = backend;

/** The parts of the Editor component the drafts use. */
interface EditorApi {
  getText(): string;
  load(text: string, format?: string, keepSelection?: boolean): unknown;
  replaceText(text: string): unknown;
  composing(): boolean;
  undo(): unknown;
  focus(): unknown;
}

interface Hooks {
  onSaved?: (id: string, how?: { explicit?: boolean }) => unknown;
  onOpened?: (id: string) => unknown;
  onDeleted?: (id: string) => unknown;
  /** One conditional request; null when sync is off or the server cannot be reached. */
  probeServer?: (id: string) => Promise<{ ahead: false } | { ahead: true; text: string } | null>;
}

/** What PadService.Startup returns, as the page uses it. */
export interface Start {
  home?: string;
  total?: number;
  error?: string;
  open?: (Stored & { content: string }) | null;
}

interface SaveResult {
  draft: Stored;
  cancelled: boolean;
  conflict: boolean;
  unlinkedFrom?: string[];
}

type State = "idle" | "dirty" | "saving" | "saved" | "error";
type FileState = "none" | "unknown" | "synced" | "stale"; // unknown: linked, not written in this session; stale: edited since the file was written

/** What the page shows of the open draft. */
interface Current {
  id: string;
  createdAt: number;
  updatedAt?: number;
  format: string;
  filePath: string;
}

/** A draft as the backend returns it, which is more than `Current` keeps. */
interface Stored {
  id: string;
  createdAt: number;
  updatedAt?: number;
  format: string;
  filePath?: string;
  content?: string;
}

// Kept short: the flush on pagehide cannot finish writing to IndexedDB, so a reload before the save has started loses the text.
const SAVE_DELAY_MS = 100;
const SEARCH_DELAY_MS = 200;
const PAGE = 50; // drafts shown at first, and added by "Show more"
const TOAST_MS = 8000;
const SCAN = 200; // drafts looked at per call when scanning the list
const IDLE_LOCK_MS = 5 * 60 * 1000; // an unlocked protected draft locks again after this long without a key press, click or scroll

const message = (err: unknown) => String((err as Error)?.message || err);

// The open draft, its autosave and the drawer list. `editor` is a ref to the Editor component, `drawerOpen` says whether the list is
// on screen (it is only fetched then, because each fetch reads every listed draft).
//
// A draft can also be saved to a file (Ctrl+Shift+S, then Ctrl+S). That only happens on request, never by the autosave.
// A draft is created by its first save, so an empty editor leaves none behind.
export function useDrafts(
  editor: Ref<EditorApi | null>,
  drawerOpen: Ref<boolean>,
  { onSaved, onOpened, onDeleted, probeServer }: Hooks = {},
  api: Partial<typeof backend> = {},
) {
  const be = { ...backend, ...api }; // `api` replaces backend functions in tests
  const current = ref<Current>({ id: "", createdAt: 0, format: "markdown", filePath: "" });
  const state = ref<State>("idle");
  const error = ref("");
  const list = ref<List>({ drafts: [], total: 0 });
  const query = ref("");
  const toast = ref<{ message: string; undo: (() => unknown) | null } | null>(null); // while the "Draft deleted" bar is showing
  const available = ref(true); // false when the database cannot be opened: the editor still works, nothing is saved

  // Protected drafts (docs/sync.md, "Protected drafts"). Their stored content is an envelope (lib/protect.ts); the key lives here, in memory,
  // only while the draft is open and unlocked. The passphrase itself is never kept.
  const protectedDraft = ref(false); // the open draft is protected, locked or not
  const locked = ref(false); // protected and not unlocked: the editor is empty and inert
  const listTitle = ref(""); // the title of the open protected draft in the draft list: stored unencrypted, and not taken from the text
  let session: Session | null = null;
  // Counts the moments that end what an unlock or a protect in flight was for (another draft, a lock, the app going to the background), so
  // that one finishing after them installs no key and shows no text.
  let epoch = 0;
  let envelope = ""; // what the open protected draft holds in storage
  let idleTimer: ReturnType<typeof setTimeout> | undefined;

  const home = ref(""); // the user's home folder, from the backend
  const fileState = ref<FileState>("none");

  // The linked file no longer matches the draft. Looked at when a draft is opened and when the window comes back, and raised by a save that
  // found it; a real conflict stays (ConflictDialog.vue) until the person chooses Keep or Overwrite. A draft with no edits of its own takes the
  // file's text quietly, unless the server also holds something else: then the dialog asks, with the file's text as "yours".
  const fileChange = createFileChange((id) => be.linkedFileStatus(id), {
    can: () => canAutoRefresh(),
    run: async (draft, name) => {
      let ahead: Awaited<ReturnType<NonNullable<Hooks["probeServer"]>>> | undefined = null;
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
  const copies = ref<Record<string, string>>({});
  const linkMoved = ref<{ text: string; tick: number } | null>(null); // Save as took a file from another draft
  const fileNameOf = (p: string) => String(p).split(/[\\/]/).pop();
  const recreated = ref(false); // the last write recreated a file that was gone
  const dropCopy = (id: string) => {
    if (copies.value[id]) {
      const { [id]: _gone, ...rest } = copies.value;
      copies.value = rest;
    }
  };
  let checkDone = Promise.resolve(); // the look at the file of the draft just opened: sync waits for it, so the two never race
  const refreshed = ref<{ name: string; tick: number } | null>(null); // while the "Updated from <file>" toast shows
  let dirty = false;
  let quietSave = false; // set while the draft takes the file's text: the caller says to sync (or not), so the save does not
  let stored: { text: string; format: string } | null = null; // what the saved draft holds, so a save that would change nothing is skipped and the timestamp stays
  let edits = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let chain: Promise<unknown> = Promise.resolve();
  let shown = PAGE;
  let listSeq = 0;
  let listTimer: ReturnType<typeof setTimeout> | undefined;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  const fileName = computed(() => current.value.filePath.split(/[\\/]/).pop() ?? "");
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

  const asCurrent = (d: Stored): Current => ({
    id: d.id,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    format: d.format,
    filePath: d.filePath ?? "",
  });

  function setCurrent(d: Stored) {
    refreshed.value = null;
    unlinkedToast.value = null;
    const prot = typeof d.content === "string" && isProtected(d.content);
    epoch++;
    if (d.id !== current.value.id || !prot) dropSession(); // the key never outlives the draft it opened
    current.value = asCurrent(d);
    fileState.value = current.value.filePath ? "unknown" : "none";
    dirty = false;
    protectedDraft.value = prot;
    envelope = prot ? (d.content as string) : "";
    locked.value = prot && !session;
    listTitle.value = clearTitle(envelope);
    stored = d.id && typeof d.content === "string" && !prot ? { text: d.content, format: d.format } : null;
    state.value = d.id ? "saved" : "idle";
    checkDone = fileChange.check(current.value); // also clears the dialog of the draft that was open
  }

  function dropSession() {
    session = null;
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }

  // Any key press, click or scroll while a protected draft is unlocked starts the idle time again.
  function touch() {
    if (!session) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => void lock(), IDLE_LOCK_MS);
  }

  // The text the editor shows for `d`, which setCurrent has just made the open draft: its own text, the decrypted text of a protected draft
  // that is still unlocked (the key is the same while the salt is), or "" while it is locked.
  async function plainOf(d: Stored, at = epoch, editAt = edits): Promise<string | null> {
    if (!protectedDraft.value) return d.content ?? "";
    const key = session;
    if (key) {
      const sealed = envelope;
      const t = await openWith(key, sealed, d.id);
      if (epoch !== at || current.value.id !== d.id || session !== key || locked.value || edits !== editAt) return null;
      if (t !== null) {
        stored = { text: t, format: d.format };
        listTitle.value = clearTitle(sealed);
        return t;
      }
      dropSession(); // another device protected it again with another passphrase
      locked.value = true;
    }
    return "";
  }

  // Locks the open protected draft: what is unsaved is saved first, then the key and the text leave memory.
  // It does not lock when the save did not succeed: the key and the editor are the only copy of what was typed.
  async function lock() {
    epoch++;
    if (!protectedDraft.value || !session) return;
    await flush();
    await chain;
    if (!session) return;
    if (dirty || state.value === "error") {
      showToast("Not locked: the draft could not be saved, so its text is kept on screen.");
      return;
    }
    dropSession();
    locked.value = true;
    stored = null;
    editor.value?.load("", current.value.format); // also drops the undo history
  }

  // Unlocks the open protected draft. Rejects with WrongPassphrase (lib/protect.ts) when the passphrase does not open it.
  async function unlock(passphrase: string) {
    if (!locked.value) return;
    const id = current.value.id;
    const at = epoch;
    const r = await unlockEnvelope(envelope, id, passphrase);
    if (epoch !== at || current.value.id !== id || !locked.value)
      throw new Error("The draft changed while it was being unlocked. Try again.");
    session = r.session;
    locked.value = false;
    listTitle.value = clearTitle(envelope);
    stored = { text: r.content, format: current.value.format };
    editor.value?.load(r.content, current.value.format);
    touch();
    editor.value?.focus();
  }

  // A protected draft, to check a passphrase against: every protected draft has the same one, and no draft stores a check value.
  // Search does not read protected drafts, so this pages through the list and looks for the marker in each summary.
  async function otherProtected() {
    for (let offset = 0; ; offset += SCAN) {
      const page = await be.listDrafts(SCAN, offset);
      for (const hit of page.drafts.filter(isProtectedSummary)) {
        const full = await be.getDraft(hit.id);
        if (typeof full?.content === "string" && isProtected(full.content)) return full; // the summary alone is not proof
      }
      if (page.drafts.length < SCAN) return null;
    }
  }

  // Starts a new, empty protected draft. With no protected draft yet the passphrase is a new one; otherwise it must open another protected
  // draft (rejects with WrongPassphrase), so all of them share it. Nothing is stored until something is typed. A draft is protected from
  // its first save and stays so: protection is never added to or taken from an existing draft.
  async function createSecure(passphrase: string, title: string) {
    if (!available.value) return;
    await flush();
    const at = epoch;
    const other = await otherProtected();
    if (other) await unlockEnvelope(other.content ?? "", other.id, passphrase);
    const made = await newSession(passphrase);
    if (epoch !== at) throw new Error("The draft changed while the new one was being made. Try again.");
    setCurrent({ id: "", createdAt: 0, format: "markdown", filePath: "" });
    session = made;
    protectedDraft.value = true;
    locked.value = false;
    listTitle.value = title.trim();
    editor.value?.load("", "markdown");
    touch();
    editor.value?.focus();
  }

  // Called after every change the user makes to the text.
  function edited() {
    touch();
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
  function setFormat(format: string) {
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
    if (protectedDraft.value && !session) {
      dirty = false; // locked: there is nothing to write, the editor is inert
      state.value = "saved";
      return;
    }
    state.value = "saving";
    try {
      // A protected draft is written as its envelope; the text and the key stay here.
      // A new protected draft gets its id here, as the seal covers it.
      const id = current.value.id || (session ? newDraftId() : "");
      const content = session ? await seal(session, id, text, listTitle.value) : text;
      const d = await be.saveDraft({
        id,
        format: current.value.format,
        content,
        createdAt: current.value.createdAt,
      });
      if (session) envelope = d.content ?? content;
      stored = { text: session ? text : (d.content ?? text), format: d.format };
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
    timer = undefined;
    chain = chain.then(saveNow);
    return chain;
  }

  // Write the text to its file, and save the draft with it. With `saveAs`, or when the draft has no file yet, the user picks the file;
  // when they cancel nothing changes. A draft that has never been saved to a file only gets its draft saved (Ctrl+S).
  // This is Sync (Ctrl+S): it saves the draft, writes the linked file only if the draft changed since the file was written (an untouched
  // file keeps its modified time), and always asks sync to look at the server (`onSaved` with `explicit`).
  function saveFile(saveAs = false) {
    if (!available.value) return Promise.resolve();
    if (protectedDraft.value) {
      // Writing a file would put the text on disk unprotected. Ctrl+S still saves the draft and syncs it.
      if (saveAs) showToast("A protected draft cannot be saved to a file.");
      return flush().then(() => current.value.id && onSaved?.(current.value.id, { explicit: true }));
    }
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
    async saveCopy(text: string, from: string) {
      // A copy of a protected draft is protected too, sealed under its own id with the key already held.
      // Never as plain text: a protected draft that locked meanwhile has no key to seal with, so the copy is refused.
      if (protectedDraft.value && !session) throw new Error("the draft is locked. Unlock it and try again");
      const id = protectedDraft.value ? newDraftId() : undefined;
      const content = id && session ? await seal(session, id, text, listTitle.value) : text;
      const d = await be.saveDraft({ id, format: current.value.format, content });
      copies.value = { ...copies.value, [d.id]: from };
      refreshListSoon();
      onSaved?.(d.id);
      return d.id;
    },
    // Write the draft's text to its file (never the autosave's job). Rejects with the reason.
    async writeFile() {
      await flush();
      const why = (await (chain = chain.then(() => writeFile(false, true, false)))) as string;
      if (why) throw new Error(why);
    },
    // The draft takes the file's text (it has no edits of its own), without pushing: the dialog pushes.
    applyFile: () => reloadFromFile({ push: false }),
    current: () => ({
      id: current.value.id,
      text: editor.value?.getText() ?? "",
      format: current.value.format,
      updatedAt: current.value.updatedAt,
      revision: edits,
    }),
  };

  // "Reload from file" in the toast: the draft's text becomes the file's text, as one edit that Ctrl+Z takes back. Go reads the stored path and
  // makes the file the baseline, so the next save does not report it again.
  // `auto` (the file's name) is the quiet refresh of a draft with no edits of its own: it runs only if nothing is unsaved, being typed or
  // saved, before and after the file is read, and shows the "Updated from" toast.
  function reloadFromFile({ auto = "", push = true } = {}) {
    const id = current.value.id;
    if (!auto) fileChange.clear();
    if (!available.value || !id || !current.value.filePath || protectedDraft.value) return Promise.resolve();
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
        timer = undefined;
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
  const unlinkedToast = ref<{ id: string; name: string; tick: number } | null>(null);
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
    if (!t || !available.value || protectedDraft.value) return Promise.resolve(); // a protected draft has no file
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
  async function writeFile(saveAs: boolean, force = false, push = true) {
    if (protectedDraft.value) return "A protected draft cannot be written to a file."; // the file would hold its text unprotected
    const text = editor.value?.getText() ?? "";
    if (!current.value.id && text.trim() === "") return "";
    const mine = edits;
    const wasGone = fileChange.problem.value?.reason === "file not found";
    const before = state.value;
    state.value = "saving";
    try {
      const r = (await be.saveDraftToFile(
        {
          id: current.value.id,
          format: current.value.format,
          content: text,
          createdAt: current.value.createdAt,
          filePath: current.value.filePath,
        },
        saveAs,
        force && !saveAs,
      )) as SaveResult;
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
          text: `${fileNameOf(r.draft.filePath ?? "")} now belongs to this draft, no longer to "${r.unlinkedFrom.join('", "')}"`,
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

  function setQuery(q: string) {
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
  function showToast(text: string, undo: (() => unknown) | null = null, { deleted = "" } = {}) {
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
  function init(start: Start, fallback = "") {
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
      return protectedDraft.value ? "" : start.open.content;
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

  async function open(id: string) {
    if (id === current.value.id) return;
    await flush();
    try {
      const d = await be.getDraft(id);
      setCurrent(d);
      const at = epoch;
      const editAt = edits;
      const text = await plainOf(d, at, editAt);
      if (text === null || epoch !== at || current.value.id !== d.id || edits !== editAt) return;
      editor.value?.load(text, d.format);
      await checkDone;
      if (epoch !== at || current.value.id !== d.id) return;
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
    const id = current.value.id;
    const before = epoch;
    const d = await be.getDraft(id);
    if (epoch !== before || current.value.id !== id || !canReplace()) return;
    const was = stored?.text;
    setCurrent(d);
    const at = epoch;
    const editAt = edits;
    // Newer text from the server: the linked file now lags the draft, so the next Ctrl+S writes it (and asks first if the file changed).
    if (current.value.filePath && was !== d.content) fileState.value = "stale";
    const text = await plainOf(d, at, editAt);
    if (text === null || epoch !== at || current.value.id !== d.id || edits !== editAt || !canReplace()) return;
    editor.value?.load(text, d.format, true); // same draft, newer text: the person's selection stays
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
  async function remove(id: string) {
    let draft: Awaited<ReturnType<typeof be.getDraft>>;
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
  async function removedElsewhere(draft: { id: string }) {
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
  async function restore(draft: Stored & { content: string }) {
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
    void lock(); // switching to another application leaves the window visible, so this is the background too
  };
  const onPageHide = () => {
    flush();
  };
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      flush();
      void lock(); // a protected draft locks when the app goes to the background
    } else checkFile();
  };
  function attach() {
    window.addEventListener("blur", onLeave);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("focus", checkFile);
    document.addEventListener("visibilitychange", onVisibility);
    for (const ev of ["keydown", "pointerdown", "wheel"]) window.addEventListener(ev, touch, { passive: true });
  }
  function detach() {
    window.removeEventListener("blur", onLeave);
    window.removeEventListener("pagehide", onPageHide);
    window.removeEventListener("focus", checkFile);
    document.removeEventListener("visibilitychange", onVisibility);
    for (const ev of ["keydown", "pointerdown", "wheel"]) window.removeEventListener(ev, touch);
    for (const t of [timer, listTimer, searchTimer, toastTimer, idleTimer]) clearTimeout(t);
  }

  return {
    current,
    status,
    state,
    fileState,
    needsSave,
    protectedDraft,
    locked,
    listTitle,
    lock,
    unlock,
    createSecure,
    hasProtected: async () => !!(await otherProtected()),
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
    showToast,
    open,
    create,
    remove,
    undo,
    dismissToast,
    attach,
    detach,
  };
}
