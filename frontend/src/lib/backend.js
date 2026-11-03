// Where the app keeps its data and asks its host for things. There are two builds of the same frontend:
//   - desktop (`vite build`): the Go side, through the Wails bindings. The database lives in the user's data folder.
//   - web (`vite build --mode web`, deployed to GitHub Pages): no Go side. The same data is kept in the browser's IndexedDB.
// Everything else in the frontend goes through this file, so nothing else needs to know which build it is in.
//
// The bindings are imported on demand and only in the desktop build, so the web bundle carries no Wails code.

import { createWebDrafts, DB_NAME, DB_VERSION, upgrade } from "./webDrafts.js";
import { saveWebFile, sharesFiles } from "./webFiles.js";

export const isWeb = import.meta.env.MODE === "web";

// The web build on a browser without a file picker (iPhone, iPad): Save opens the share sheet.
export const sharing = isWeb && sharesFiles();

const bindings = isWeb ? undefined : () => import("../../bindings/github.com/cthtrifork/harper-pad/internal/app");

const emptySettings = () => ({ version: 1, words: [], ignored: "" });

// --- Browser storage (web build) ---------------------------------------------------------------------------------------------

const STORE = "kv";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

async function idbPut(key, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
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

// --- Drafts ------------------------------------------------------------------------------------------------------------------
// The same operations on both builds: DraftService's methods on desktop (SQLite), IndexedDB in the browser (webDrafts.js).

const web = isWeb ? createWebDrafts(openDb) : undefined;

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

// Saves the draft's text to a file as well as to the database, and returns {draft, cancelled}. With `saveAs`, or when the draft was
// never saved to a file, the user picks the file (`cancelled` is true when they close the dialog); otherwise the file it was
// saved to before is overwritten. The returned draft carries `filePath`. On desktop the path never comes from the page.
// When the file was changed by something else since it was last written, nothing is written and `conflict` is true, unless
// `overwrite` is set.
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
