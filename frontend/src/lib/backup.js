// A backup of everything the web build keeps on this device: the drafts and the dictionary and ignore list, as one JSON file the person
// can store anywhere and restore on another device or after the browser's data was cleared. Pure functions; backend.js reads and writes
// the stores. The Home Screen app and a Safari tab do not share storage, so this is also how drafts move between them.
import { exportList, hashesOf } from "./ignoreList.js";

export const BACKUP_FORMAT = "harper-pad-backup";
export const BACKUP_VERSION = 1;
const MAX_CONTENT_BYTES = 1 << 20; // as webDrafts.js and internal/store
const MAX_BACKUP_BYTES = 256 << 20;
const ID = /^[0-9a-f]{32}$/;

// {format, version, exportedAt, drafts, settings}. Drafts keep their ids and times; the file links (handles) and the sync state are
// device-specific and stay out.
export function buildBackup({ drafts, settings, now = Date.now() }) {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now,
    drafts: drafts.map((d) => ({ id: d.id, format: d.format, content: d.content, createdAt: d.createdAt, updatedAt: d.updatedAt })),
    settings: { words: settings?.words ?? [], ignored: settings?.ignored ?? "", ignoredLabels: settings?.ignoredLabels ?? {} },
  };
}

// harper-pad-backup-2026-11-06.json
export const backupFileName = (now = Date.now()) => `harper-pad-backup-${new Date(now).toISOString().slice(0, 10)}.json`;

const validDraft = (d) =>
  !!d &&
  typeof d === "object" &&
  ID.test(d.id ?? "") &&
  (d.format === "markdown" || d.format === "text") &&
  typeof d.content === "string" &&
  new TextEncoder().encode(d.content).length <= MAX_CONTENT_BYTES &&
  d.createdAt > 0 &&
  d.updatedAt > 0;

// Reads the text of a backup file: {drafts, settings, skipped}. Throws an Error whose message can be shown as it is. A draft that is not
// valid is left out and counted in `skipped`; a file from a newer version of the app is refused, because it may mean something else.
export function parseBackup(text) {
  if (text.length > MAX_BACKUP_BYTES) throw new Error("This file is too large to be a Harper Pad backup.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("This is not a Harper Pad backup (the file is not JSON).");
  }
  if (data?.format !== BACKUP_FORMAT || !Array.isArray(data.drafts)) throw new Error("This is not a Harper Pad backup.");
  if (!(data.version >= 1 && data.version <= BACKUP_VERSION)) {
    throw new Error("This backup was made by a newer version of Harper Pad. Update the app and try again.");
  }
  const drafts = data.drafts
    .filter(validDraft)
    .map((d) => ({ id: d.id, format: d.format, content: d.content, createdAt: d.createdAt, updatedAt: d.updatedAt }));
  const words = Array.isArray(data.settings?.words) ? data.settings.words.filter((w) => typeof w === "string") : [];
  const ignored = typeof data.settings?.ignored === "string" ? data.settings.ignored : "";
  const labels = data.settings?.ignoredLabels && typeof data.settings.ignoredLabels === "object" ? data.settings.ignoredLabels : {};
  return { drafts, settings: { words, ignored, ignoredLabels: labels }, skipped: data.drafts.length - drafts.length };
}

// What restoring does to each draft, given the update time of every draft already here ({id: updatedAt}): one that is not here is
// added, one that is older here is replaced, and one that is as new or newer here is kept. Restoring never deletes and never overwrites
// newer work, so it is safe to run twice or on a device that has moved on.
export function planRestore(existing, drafts) {
  const add = [];
  const replace = [];
  let kept = 0;
  for (const d of drafts) {
    const have = existing.get(d.id);
    if (have === undefined) add.push(d);
    else if (d.updatedAt > have) replace.push(d);
    else kept++;
  }
  return { add, replace, kept };
}

// The dictionary and ignore list after restoring: everything that is here and everything in the backup.
export function mergeSettings(local, incoming) {
  const words = [...new Set([...(local?.words ?? []), ...(incoming?.words ?? [])])].sort((a, b) => a.localeCompare(b));
  const hashes = [...new Set([...hashesOf(local?.ignored), ...hashesOf(incoming?.ignored)])];
  const ignoredLabels = { ...incoming?.ignoredLabels, ...local?.ignoredLabels };
  return { ...local, version: 1, words, ignored: hashes.length ? exportList(hashes) : (local?.ignored ?? ""), ignoredLabels };
}

// One line for the toast after a restore.
export function restoreMessage({ added, replaced, kept, skipped }) {
  const n = added + replaced;
  const parts = [n === 0 ? "Nothing new in the backup" : `Restored ${n} ${n === 1 ? "draft" : "drafts"}`];
  if (kept) parts.push(`${kept} already up to date`);
  if (skipped) parts.push(`${skipped} skipped`);
  return `${parts.join(", ")}.`;
}
