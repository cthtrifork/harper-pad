import { ignoredSync, loadSettings, saveSettings, syncDevice, wordsSync } from "./backend.js";
import { hashesOf } from "./personalSets.js";
import { reconcile } from "./settingsItems.js";

export { applyIgnored, ignoredHashes, removeIgnored, withoutWord, withoutWords } from "./personalSets.js";

// What each ignored finding was, by hash. Harper's export holds only hashes of the finding in its context, so without this the list
// could not say what was ignored. Hashes are kept as text: they are 64-bit and do not fit a JS number.
let labels = {};

// What the Problems panel shows: the dictionary, and the ignored findings.
async function snapshot(harper) {
  const words = [...(await harper.exportWords())].sort((a, b) => a.localeCompare(b));
  const ignored = hashesOf(await harper.exportIgnoredLints()).map((hash) => ({ hash, label: labels[hash] || "A finding in its context" }));
  return { words, ignored };
}

// Load the saved dictionary, and ignore list from the backend (Go on desktop, IndexedDB in the browser) into Harper. Call it
// before the first check, so findings the user already dealt with never flash up.
export async function loadPersonal(harper) {
  const saved = await loadSettings();
  labels = { ...saved.ignoredLabels };
  if (saved.words?.length) await harper.importWords(saved.words);
  if (saved.ignored) await harper.importIgnoredLints(saved.ignored);
  return snapshot(harper);
}

// Remember what a finding was, when it is ignored.
export function noteIgnored(hash, label) {
  labels[String(hash)] = label;
}

// Save what Harper holds now. Harper is the source of truth during a run; the backend only keeps a copy between runs.
export async function savePersonal(harper) {
  const words = await harper.exportWords();
  const ignored = await harper.exportIgnoredLints();
  const keep = new Set(hashesOf(ignored));
  labels = Object.fromEntries(Object.entries(labels).filter(([hash]) => keep.has(hash)));
  await saveSettings({ version: 1, words, ignored, ignoredLabels: labels });
  await noteSets(words, hashesOf(ignored));
  return snapshot(harper);
}

// Remember when the dictionary and the ignore list changed, so syncing them can tell an item removed here from one never added
// (docs/sync.md, "Settings"). Only for a device that syncs; a failure here must not fail the save.
async function noteSets(words, hashes) {
  try {
    if (!(await syncDevice.load())) return;
    for (const [store, current] of [
      [wordsSync, words],
      [ignoredSync, hashes],
    ]) {
      const rec = await store.load();
      await store.save({ items: reconcile(rec.items, current, Date.now()) });
    }
  } catch {
    // the next sync stamps what it finds
  }
}
