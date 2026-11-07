// Where the app keeps its data and asks its host for things. Two builds share the frontend:
//   - desktop: the Go side, through the Wails bindings;
//   - web (GitHub Pages): no Go side, the same data in IndexedDB.
// Everything else goes through this file, so nothing else needs to know the build. The bindings are imported on demand, so the web
// bundle carries no Wails code.

import { createWebDrafts, openDatabase } from "./webDrafts.ts";
import { createDesktopSyncDrafts } from "./desktopSync.ts";
import { withLastOpened } from "./lastOpened.ts";
import { createSettingsSyncStore } from "./settingsSync.ts";
import { createDeviceStore } from "./syncDevice.ts";
import { withSummary } from "./summarize.ts";
import { fileName, saveWebFile, sharesFiles } from "./webFiles.ts";

type Bindings = typeof import("../../bindings/github.com/cthtrifork/harper-pad/internal/app");
type Settings = import("../../bindings/github.com/cthtrifork/harper-pad/internal/app").Settings;
type Draft = import("../../bindings/github.com/cthtrifork/harper-pad/internal/store").Draft;

export const isWeb = import.meta.env?.MODE === "web";

// The web build on a browser without a file picker (iPhone, iPad): Save opens the share sheet.
export const sharing = isWeb && sharesFiles();

// Only called when !isWeb: in the web build the guard is a constant, so the import (and the Wails code) is dropped from the bundle.
const bindings = (isWeb
  ? undefined
  : () => import("../../bindings/github.com/cthtrifork/harper-pad/internal/app")) as unknown as () => Promise<Bindings>;

const emptySettings = () => ({ version: 1, words: [], ignored: "" });

// --- Browser storage (web build) ---------------------------------------------------------------------------------------------

const STORE = "kv";

const openDb = openDatabase;

async function idbGet(key: string) {
  const db = await openDb();
  try {
    return await db.get(STORE, key);
  } finally {
    db.close();
  }
}

async function idbPut(key: string, value: unknown) {
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

export async function saveSettings(settings: Settings) {
  if (!isWeb) return (await bindings()).SettingsService.SaveSettings(settings);
  return idbPut("settings", settings);
}

// --- Sync device ----------------------------------------------------------------------------------------------------------------
// The server, token and key this device syncs with: {load, save, clear}. The same on both builds, in the webview's or browser's IndexedDB
// (see syncDevice.ts); it is not part of the Go side.
export const syncDevice = createDeviceStore(openDb);

// What the last sync of the dictionary and ignore list matched, for the next one: {load, save, clear} (settingsSync.ts). Same place, same builds.
export const settingsSync = createSettingsSyncStore(openDb);

// --- Drafts ------------------------------------------------------------------------------------------------------------------
// The same operations on both builds: DraftService's methods on desktop (SQLite), IndexedDB in the browser (webDrafts.ts).

// Only used when isWeb (the guards below); typed as present so the call sites need no checks.
const web = (isWeb ? createWebDrafts(openDb) : undefined) as unknown as ReturnType<typeof createWebDrafts>;

// What sync needs from the drafts store: IndexedDB in the browser, the Go services on desktop (desktopSync.ts). Same operations either way.
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
// The draft that was open last on this device (lib/lastOpened.ts) replaces the most recent one when it still exists.
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
export async function listDrafts(limit: number, offset: number) {
  return isWeb ? web.list(limit, offset) : (await bindings()).DraftService.ListDrafts(limit, offset);
}

// The drafts whose text contains `query`, newest first: {drafts, total}.
export async function searchDrafts(query: string, limit: number) {
  return isWeb ? web.search(query, limit) : (await bindings()).DraftService.SearchDrafts(query, limit);
}

export async function getDraft(id: string) {
  return isWeb ? web.get(id) : (await bindings()).DraftService.GetDraft(id);
}

// Creates a draft (empty id) or updates one, and returns it as stored. Saving an id that is no longer stored brings it back.
export async function saveDraft(draft: Draft) {
  return isWeb ? web.save(draft) : (await bindings()).DraftService.SaveDraft(withSummary(draft));
}

// Saves the draft's text to a file as well as to the database, and returns {draft, cancelled}. `conflict` is true when something
// else changed the file since it was written, unless `overwrite` is set.
export async function saveDraftToFile(draft: Draft, saveAs: boolean, overwrite = false) {
  // The summary goes with the draft (Go stores it as it is), and the name the save dialog offers is made here from its title, as on the web;
  // Go keeps only the base name.
  if (!isWeb) {
    const sent = withSummary(draft);
    return (await bindings()).DraftService.SaveDraftToFile(sent, saveAs, overwrite, fileName(sent.title, sent.format));
  }
  return saveWebFile(
    web,
    (id: string) => idbGet(`file:${id}`),
    (id: string, handle: unknown) => idbPut(`file:${id}`, handle),
    draft,
    saveAs,
    overwrite,
  );
}

// Desktop only: how the file the draft is linked to compares with the draft: {state, reason, stamp, clean} with state "none" | "same" | "changed" | "missing" | "broken". Go reads the stored path. The web build has no path to
// look at, so it always answers "none".
export async function linkedFileStatus(id: string) {
  if (isWeb) return { state: "none" };
  return (await bindings()).DraftService.LinkedFileStatus(id);
}

// Desktop only: the text and version stamp of the draft's file, read from the stored path ({text, stamp}); rejects when it is not text.
export async function linkedFileText(id: string) {
  if (isWeb) throw new Error("there is no file to read in the web build");
  return (await bindings()).DraftService.LinkedFileText(id);
}

// Desktop only: makes the file's text (as `linkedFileText` returned it, with its stamp) the baseline of the draft's link, once the draft has it.
export async function recordLinkedFile(id: string, stamp: string) {
  if (isWeb) throw new Error("there is no file to read in the web build");
  return (await bindings()).DraftService.RecordLinkedFile(id, stamp);
}

// Desktop only: stops linking the draft to its file; both stay as they are. Returns the draft as stored.
export async function unlinkDraftFile(id: string) {
  if (isWeb) throw new Error("the web build cannot unlink a file");
  return (await bindings()).DraftService.UnlinkDraftFile(id);
}

// Desktop only: puts back the link the last unlink removed for this draft (the same file and baseline, kept in Go; the page names no path).
export async function undoUnlinkDraftFile(id: string) {
  if (isWeb) throw new Error("the web build cannot unlink a file");
  return (await bindings()).DraftService.UndoUnlinkDraftFile(id);
}

export async function deleteDraft(id: string) {
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
