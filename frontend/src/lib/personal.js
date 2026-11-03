import { loadSettings, saveSettings } from "./backend.js";

// The English dialects Harper checks for. `value` is harper.js's Dialect enum, repeated here so this file does not pull harper.js into
// the first bundle (it is loaded after the first paint, see harper.js).
export const DIALECTS = [
  { id: "american", label: "English (US)", value: 0 },
  { id: "british", label: "English (UK)", value: 1 },
  { id: "australian", label: "English (Australia)", value: 2 },
  { id: "canadian", label: "English (Canada)", value: 3 },
  { id: "indian", label: "English (India)", value: 4 },
];
const dialectOf = (id) => DIALECTS.find((d) => d.id === id) ?? DIALECTS[0];

// What each ignored finding was, by hash. Harper's export holds only hashes of the finding in its context, so without this the list
// could not say what was ignored. Hashes are kept as text: they are 64-bit and do not fit a JS number.
let labels = {};
let dialect = DIALECTS[0].id;

// The hashes in Harper's exported ignore list, {"context_hashes": [...]}, as text. Read with a pattern, not JSON.parse, which would round them.
function hashesOf(json) {
  const list = /"context_hashes"\s*:\s*\[([^\]]*)\]/.exec(json ?? "");
  return list?.[1].match(/\d+/g) ?? [];
}

// The same list as text, built by hand for the same reason.
const exportList = (hashes) => `{"context_hashes":[${hashes.join(",")}]}`;

// What the Problems panel shows: the dictionary, the ignored findings and the dialect.
async function snapshot(harper) {
  const words = [...(await harper.exportWords())].sort((a, b) => a.localeCompare(b));
  const ignored = hashesOf(await harper.exportIgnoredLints()).map((hash) => ({ hash, label: labels[hash] || "A finding in its context" }));
  return { words, ignored, dialect };
}

// Load the saved dictionary, ignore list and dialect from the backend (Go on desktop, IndexedDB in the browser) into Harper. Call it
// before the first check, so findings the user already dealt with never flash up.
export async function loadPersonal(harper) {
  const saved = await loadSettings();
  labels = { ...saved.ignoredLabels };
  dialect = dialectOf(saved.dialect).id;
  if (dialect !== DIALECTS[0].id) await harper.setDialect(dialectOf(dialect).value);
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
  await saveSettings({ version: 1, words, ignored, ignoredLabels: labels, dialect });
  return snapshot(harper);
}

export async function setDialect(harper, id) {
  await harper.setDialect(dialectOf(id).value);
  dialect = dialectOf(id).id;
}

// Stop ignoring one finding: Harper can only take the whole list back, so put the others back after clearing it.
export async function removeIgnored(harper, hash) {
  const rest = hashesOf(await harper.exportIgnoredLints()).filter((h) => h !== hash);
  await harper.clearIgnoredLints();
  if (rest.length) await harper.importIgnoredLints(exportList(rest));
}

// Harper can add words to its dictionary but not take one out. To remove a word, build a new linter with the words that stay (and the
// same ignore list and dialect) and return it; the caller swaps it in and disposes the old one.
export async function withoutWord(harper, word, create) {
  const words = (await harper.exportWords()).filter((w) => w !== word);
  const ignored = await harper.exportIgnoredLints();
  const next = await create(dialectOf(dialect).value);
  try {
    if (words.length) await next.importWords(words);
    if (hashesOf(ignored).length) await next.importIgnoredLints(ignored);
  } catch (err) {
    next.dispose().catch(() => {});
    throw err;
  }
  return next;
}
