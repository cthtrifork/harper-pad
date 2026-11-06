import { loadSettings, saveSettings } from "./backend.js";
import { exportList, hashesOf } from "./ignoreList.js";

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
  return snapshot(harper);
}

// Stop ignoring one finding: Harper can only take the whole list back, so put the others back after clearing it.
export async function removeIgnored(harper, hash) {
  const rest = hashesOf(await harper.exportIgnoredLints()).filter((h) => h !== hash);
  await harper.clearIgnoredLints();
  if (rest.length) await harper.importIgnoredLints(exportList(rest));
}

// Harper can add words to its dictionary but not take one out. To remove a word, build a new linter with the words that stay (and the
// same ignore list) and return it; the caller swaps it in and disposes the old one.
export async function withoutWord(harper, word, create) {
  const words = (await harper.exportWords()).filter((w) => w !== word);
  const ignored = await harper.exportIgnoredLints();
  const next = await create();
  try {
    if (words.length) await next.importWords(words);
    if (hashesOf(ignored).length) await next.importIgnoredLints(ignored);
  } catch (err) {
    next.dispose().catch(() => {});
    throw err;
  }
  return next;
}
