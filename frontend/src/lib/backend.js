// Where the app keeps its data and asks its host for things. Two builds share the frontend:
//   - desktop: the Go side, through the Wails bindings;
//   - web (GitHub Pages): no Go side, the same data in IndexedDB.
// Everything else goes through this file, so nothing else needs to know the build. The bindings are imported on demand, so the web
// bundle carries no Wails code.

import { createWebDrafts, openDatabase } from "./webDrafts.js";
import { createDesktopSyncDrafts } from "./desktopSync.js";
import { withLastOpened } from "./lastOpened.js";
import { createSettingsSyncStore } from "./settingsSync.js";
import { createDeviceStore } from "./syncDevice.js";
import { saveWebFile, sharesFiles } from "./webFiles.js";

export const isWeb = import.meta.env?.MODE === "web";

// The web build on a browser without a file picker (iPhone, iPad): Save opens the share sheet.
export const sharing = isWeb && sharesFiles();

const bindings = isWeb ? undefined : () => import("../../bindings/github.com/cthtrifork/harper-pad/internal/app");

const emptySettings = () => ({ version: 1, words: [], ignored: "" });

// --- Browser storage (web build) ---------------------------------------------------------------------------------------------

const STORE = "kv";

const openDb = openDatabase;

async function idbGet(key) {
  const db = await openDb();
  try {
    return await db.get(STORE, key);
  } finally {
    db.close();
  }
}

async function idbPut(key, value) {
  const db = await openDb();
  try {
    await db.put(STORE, value, key);
  } finally {
    db.close();
  }
}

// --- What the frontend uses --------------------------------------------------------------------------------------------------

// The saved dictionary and ignore list: {version, words, ignored}. Empty settings on a first run.
export async function loadSettings() {
  if (!isWeb) return (await bindings()).SettingsService.LoadSettings();
  const saved = await idbGet("settings");
  return { ...emptySettings(), ...saved };
}

export async function saveSettings(settings) {
  if (!isWeb) return (await bindings()).SettingsService.SaveSettings(settings);
  return idbPut("settings", settings);
}

// --- Sync device ----------------------------------------------------------------------------------------------------------------
// The server, token and key this device syncs with: {load, save, clear}. The same on both builds, in the webview's or browser's IndexedDB
// (see syncDevice.js); it is not part of the Go side.
export const syncDevice = createDeviceStore(openDb);

// What the last sync of the dictionary and ignore list matched, for the next one: {load, save, clear} (settingsSync.js). Same place, same builds.
export const settingsSync = createSettingsSyncStore(openDb);

// --- Drafts ------------------------------------------------------------------------------------------------------------------
// The same operations on both builds: DraftService's methods on desktop (SQLite), IndexedDB in the browser (webDrafts.js).

const web = isWeb ? createWebDrafts(openDb) : undefined;

// What sync needs from the drafts store: IndexedDB in the browser, the Go services on desktop (desktopSync.js). Same operations either way.
export const syncDrafts = web
  ? {
      get: web.get,
      save: web.save,
      allIds: web.allIds,
      changes: web.changes,
      isChanged: web.isChanged,
      syncState: web.syncState,
      markSynced: web.markSynced,
      applyRemote: web.applyRemote,
      applyRemoteDelete: web.applyRemoteDelete,
    }
  : createDesktopSyncDrafts(bindings);

// Everything the page needs before it shows the editor, in one call: {demo, open, total, error}. `demo` is the banner text in a
// desktop development build's demo mode (empty otherwise), `open` the draft to show (the last opened, else the most recent one) with its text (or null), `total` how many
// drafts there are, and `error` why drafts are unavailable (empty when they are).
// The draft that was open last on this device (lib/lastOpened.js) replaces the most recent one when it still exists.
export async function startup() {
  const start = await (isWeb ? web.startup() : (await bindings()).PadService.Startup());
  return withLastOpened(start, getDraft);
}

// Desktop only: move the database aside (as harper-pad.db.bad-<time>, never deleted) and start a new, empty one. Offered when the
// drafts cannot be read. Returns where the old file went.
export async function startFresh() {
  if (isWeb) throw new Error("there is no database file in the web build");
  return (await bindings()).DraftService.StartFresh();
}

// A page of draft summaries, newest first: {drafts, total}. The summaries carry no text.
export async function listDrafts(limit, offset) {
  return isWeb ? web.list(limit, offset) : (await bindings()).DraftService.ListDrafts(limit, offset);
}

// The drafts whose text contains `query`, newest first: {drafts, total}.
export async function searchDrafts(query, limit) {
  return isWeb ? web.search(query, limit) : (await bindings()).DraftService.SearchDrafts(query, limit);
}

export async function getDraft(id) {
  return isWeb ? web.get(id) : (await bindings()).DraftService.GetDraft(id);
}

// Creates a draft (empty id) or updates one, and returns it as stored. Saving an id that is no longer stored brings it back.
export async function saveDraft(draft) {
  return isWeb ? web.save(draft) : (await bindings()).DraftService.SaveDraft(draft);
}

// Saves the draft's text to a file as well as to the database, and returns {draft, cancelled}. `conflict` is true when something
// else changed the file since it was written, unless `overwrite` is set.
export async function saveDraftToFile(draft, saveAs, overwrite = false) {
  if (!isWeb) return (await bindings()).DraftService.SaveDraftToFile(draft, saveAs, overwrite);
  return saveWebFile(
    web,
    (id) => idbGet(`file:${id}`),
    (id, handle) => idbPut(`file:${id}`, handle),
    draft,
    saveAs,
    overwrite,
  );
}

// Desktop only: how the file the draft is linked to compares with the draft: {state, reason, stamp, fileLines, draftLines, onlyInFile,
// onlyInDraft} with state "none" | "same" | "changed" | "missing" | "broken". Go reads the stored path. The web build has no path to
// look at, so it always answers "none".
export async function linkedFileStatus(id) {
  if (isWeb) return { state: "none" };
  return (await bindings()).DraftService.LinkedFileStatus(id);
}

// Desktop only: the text and version stamp of the draft's file, read from the stored path ({text, stamp}); rejects when it is not text.
export async function linkedFileText(id) {
  if (isWeb) throw new Error("there is no file to read in the web build");
  return (await bindings()).DraftService.LinkedFileText(id);
}

// Desktop only: replaces the draft's text with its file's text (Go reads the stored path) and returns the draft as stored.
export async function reloadDraftFromFile(id) {
  if (isWeb) throw new Error("there is no file to reload from in the web build");
  return (await bindings()).DraftService.ReloadDraftFromFile(id);
}

// Desktop only: after a reload was undone, so that the next save of the linked file reports it as changed. Nothing is written.
export async function markFileDiffers(id) {
  if (!isWeb) await (await bindings()).DraftService.MarkFileDiffers(id);
}

// Desktop only: stops linking the draft to its file; both stay as they are. Returns the draft as stored.
export async function unlinkDraftFile(id) {
  if (isWeb) throw new Error("the web build cannot unlink a file");
  return (await bindings()).DraftService.UnlinkDraftFile(id);
}

export async function deleteDraft(id) {
  return isWeb ? web.remove(id) : (await bindings()).DraftService.DeleteDraft(id);
}

// Ask the browser not to evict this site's data when storage runs low. Safari grants it to an installed (Add to Home Screen) app.
// Does nothing on desktop, where the data is a file.
export async function keepData() {
  if (!isWeb) return false;
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
