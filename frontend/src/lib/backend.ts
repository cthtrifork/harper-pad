// The only file that knows which build it is in (docs/architecture.md, "One frontend, two hosts"): desktop goes to the Go services through
// the Wails bindings, the web build to IndexedDB.

import { createWebDrafts, openDatabase } from "./webDrafts.ts";
import { withDb } from "./kv.ts";
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

// A browser without a file picker (iPhone, iPad): Save opens the share sheet.
export const sharing = isWeb && sharesFiles();

// Only called when !isWeb. The guard is a build-time constant, so the web bundle drops the import and with it the Wails code.
const bindings = (isWeb
  ? undefined
  : () => import("../../bindings/github.com/cthtrifork/harper-pad/internal/app")) as unknown as () => Promise<Bindings>;

const emptySettings = () => ({ version: 1, words: [], ignored: "" });

// --- Browser storage (web build) ---------------------------------------------------------------------------------------------

const STORE = "kv";

const idbGet = (key: string) => withDb(openDatabase, (db) => db.get(STORE, key));
const idbPut = (key: string, value: unknown) => withDb(openDatabase, (db) => db.put(STORE, value, key));

// --- What the frontend uses --------------------------------------------------------------------------------------------------

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
// Both stores are IndexedDB on both builds; there is no Go side to them (docs/sync.md, "Key storage").
export const syncDevice = createDeviceStore(openDatabase);

export const settingsSync = createSettingsSyncStore(openDatabase);

// --- Drafts ------------------------------------------------------------------------------------------------------------------

// Only used when isWeb (the guards below); typed as present so the call sites need no checks.
const web = (isWeb ? createWebDrafts(openDatabase) : undefined) as unknown as ReturnType<typeof createWebDrafts>;

// Only the operations sync needs, whichever build it runs on.
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

// Everything the page needs before it shows the editor, in one call. The draft that was open last on this device replaces the most
// recent one when it still exists.
export async function startup() {
  const start = await (isWeb ? web.startup() : (await bindings()).PadService.Startup());
  return withLastOpened(start, getDraft);
}

// Desktop only: moves an unreadable database aside (never deleted) and starts an empty one. Returns where the old file went.
export async function startFresh() {
  if (isWeb) throw new Error("there is no database file in the web build");
  return (await bindings()).DraftService.StartFresh();
}

// Summaries, newest first; they carry no text.
export async function listDrafts(limit: number, offset: number) {
  return isWeb ? web.list(limit, offset) : (await bindings()).DraftService.ListDrafts(limit, offset);
}

export async function searchDrafts(query: string, limit: number) {
  return isWeb ? web.search(query, limit) : (await bindings()).DraftService.SearchDrafts(query, limit);
}

export async function getDraft(id: string) {
  return isWeb ? web.get(id) : (await bindings()).DraftService.GetDraft(id);
}

// An empty id creates a draft; an id that is no longer stored brings it back.
export async function saveDraft(draft: Draft) {
  return isWeb ? web.save(draft) : (await bindings()).DraftService.SaveDraft(withSummary(draft));
}

// `conflict` is true when something else changed the file since it was written, unless `overwrite` is set.
export async function saveDraftToFile(draft: Draft, saveAs: boolean, overwrite = false) {
  // Go stores the summary as sent and keeps only the base name of the file; the name the dialog offers is made here, as on the web.
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

// Desktop only; the web build has no path to look at and always answers "none".
export async function linkedFileStatus(id: string) {
  if (isWeb) return { state: "none" };
  return (await bindings()).DraftService.LinkedFileStatus(id);
}

// Desktop only; rejects when the file is not text.
export async function linkedFileText(id: string) {
  if (isWeb) throw new Error("there is no file to read in the web build");
  return (await bindings()).DraftService.LinkedFileText(id);
}

// Desktop only: the text `linkedFileText` returned becomes the baseline of the link, once the draft has it.
export async function recordLinkedFile(id: string, stamp: string) {
  if (isWeb) throw new Error("there is no file to read in the web build");
  return (await bindings()).DraftService.RecordLinkedFile(id, stamp);
}

// Desktop only; the file and the draft both stay as they are.
export async function unlinkDraftFile(id: string) {
  if (isWeb) throw new Error("the web build cannot unlink a file");
  return (await bindings()).DraftService.UnlinkDraftFile(id);
}

// Desktop only; Go remembers the file and baseline, the page names no path.
export async function undoUnlinkDraftFile(id: string) {
  if (isWeb) throw new Error("the web build cannot unlink a file");
  return (await bindings()).DraftService.UndoUnlinkDraftFile(id);
}

export async function deleteDraft(id: string) {
  return isWeb ? web.remove(id) : (await bindings()).DraftService.DeleteDraft(id);
}

// Asks the browser not to evict the site's data when storage runs low (Safari grants it to an installed app). Not needed on desktop.
export async function keepData() {
  if (!isWeb) return false;
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
