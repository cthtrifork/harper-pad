import { loadSettings, saveSettings } from "./backend.ts";
import { hashesOf, type WordList } from "./personalSets.ts";

type Harper = WordList;

export { applyIgnored, ignoredHashes, removeIgnored, withoutWord, withoutWords } from "./personalSets.ts";

// What each ignored finding was, by hash: Harper's export holds only the hashes. Kept as text, they are 64-bit.
let labels: Record<string, string> = {};

// Alphabetical, ignoring case ("apple" before "Banana"), by code unit: localeCompare would load the browser's collation data.
export const byWord = (a: string, b: string) => {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : a < b ? -1 : a > b ? 1 : 0;
};

// What the Problems panel shows.
async function snapshot(harper: Harper) {
  const words = [...(await harper.exportWords())].sort(byWord);
  const ignored = hashesOf(await harper.exportIgnoredLints()).map((hash) => ({ hash, label: labels[hash] || "A finding in its context" }));
  return { words, ignored };
}

// Call before the first check, so findings the user already dealt with never flash up.
export async function loadPersonal(harper: Harper) {
  const saved = await loadSettings();
  labels = { ...saved.ignoredLabels };
  if (saved.words?.length) await harper.importWords(saved.words);
  if (saved.ignored) await harper.importIgnoredLints(saved.ignored);
  return snapshot(harper);
}

export function noteIgnored(hash: string | bigint, label: string) {
  labels[String(hash)] = label;
}

// Harper is the source of truth during a run; the backend only keeps a copy between runs.
export async function savePersonal(harper: Harper) {
  const words = await harper.exportWords();
  const ignored = await harper.exportIgnoredLints();
  const keep = new Set(hashesOf(ignored));
  labels = Object.fromEntries(Object.entries(labels).filter(([hash]) => keep.has(hash)));
  await saveSettings({ version: 1, words, ignored, ignoredLabels: labels });
  return snapshot(harper);
}
