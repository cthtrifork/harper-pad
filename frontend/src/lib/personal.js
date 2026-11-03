import { loadSettings, saveSettings } from "./backend.js";

// How many entries Harper's exported ignore list holds: {"context_hashes": [...]}, hashes rather than the text.
function countIgnored(json) {
  try {
    return JSON.parse(json)?.context_hashes?.length ?? 0;
  } catch {
    return 0;
  }
}

// Load the saved dictionary and ignore list from the backend (Go on desktop, IndexedDB in the browser) into Harper. Call it before the first check, so findings the user
// already dealt with never flash up. Returns the counts for the Problems panel.
export async function loadPersonal(harper) {
  const saved = await loadSettings();
  if (saved.words?.length) await harper.importWords(saved.words);
  if (saved.ignored) await harper.importIgnoredLints(saved.ignored);
  return { words: saved.words?.length ?? 0, ignored: countIgnored(saved.ignored) };
}

// Save what Harper holds now. Harper is the source of truth during a run; the backend only keeps a copy between runs.
export async function savePersonal(harper) {
  const words = await harper.exportWords();
  const ignored = await harper.exportIgnoredLints();
  await saveSettings({ version: 1, words, ignored });
  return { words: words.length, ignored: countIgnored(ignored) };
}
