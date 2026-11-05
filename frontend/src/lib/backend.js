// Where the app keeps its data and asks its host for things. Two builds share the frontend:
//   - desktop: the Go side, through the Wails bindings;
//   - web (GitHub Pages): no Go side, the same data in IndexedDB.
// Everything else goes through this file, so nothing else needs to know the build. The bindings are imported on demand, so the web
// bundle carries no Wails code.

import { createWebDrafts, openDatabase } from "./webDrafts.js";
import { createDeviceStore } from "./syncDevice.js";
import { saveWebFile, sharesFiles } from "./webFiles.js";

export const isWeb = import.meta.env.MODE === "web";

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

// --- Drafts ------------------------------------------------------------------------------------------------------------------
// The same operations on both builds: DraftService's methods on desktop (SQLite), IndexedDB in the browser (webDrafts.js).

const web = isWeb ? createWebDrafts(openDb) : undefined;

// What sync needs from the drafts store: the web build only for now (desktop has no bindings for it yet).
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
  : null;

// Everything the page needs before it shows the editor, in one call: {demo, open, total, error}. `demo` is the banner text in a
// desktop development build's demo mode (empty otherwise), `open` the most recent draft with its text (or null), `total` how many
// drafts there are, and `error` why drafts are unavailable (empty when they are).
export async function startup() {
  return isWeb ? web.startup() : (await bindings()).PadService.Startup();
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
