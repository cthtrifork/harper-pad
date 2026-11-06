// The pure part of personal.js: reading and changing what Harper holds (its dictionary and its ignore list), with no storage in it, so
// the sync wiring can be tested with a fake Harper. Harper's exported ignore list is {"context_hashes": [...]}.

// The hashes in Harper's exported ignore list, as text. Read with a pattern, not JSON.parse, which would round them (they are 64-bit).
export function hashesOf(json) {
  const list = /"context_hashes"\s*:\s*\[([^\]]*)\]/.exec(json ?? "");
  return list?.[1].match(/\d+/g) ?? [];
}

// The same list as text, built by hand for the same reason.
export const exportList = (hashes) => `{"context_hashes":[${hashes.join(",")}]}`;

export async function ignoredHashes(harper) {
  return hashesOf(await harper.exportIgnoredLints());
}

// Stop ignoring findings: Harper can only take the whole list back, so put the others back after clearing it.
export async function removeIgnoredMany(harper, hashes) {
  const gone = new Set(hashes);
  const rest = (await ignoredHashes(harper)).filter((h) => !gone.has(h));
  await harper.clearIgnoredLints();
  if (rest.length) await harper.importIgnoredLints(exportList(rest));
}

export const removeIgnored = (harper, hash) => removeIgnoredMany(harper, [hash]);

// What syncing the ignore list decided: import the hashes another device ignored, clear the ones it stopped ignoring.
export async function applyIgnored(harper, { add, remove }) {
  if (remove.length) await removeIgnoredMany(harper, remove);
  if (add.length) await harper.importIgnoredLints(exportList(add));
}

// Harper can add words to its dictionary but not take one out. To remove words, build a new linter with the words that stay (and the
// same ignore list) and return it; the caller swaps it in and disposes the old one.
export async function withoutWords(harper, remove, create) {
  const gone = new Set(remove);
  const words = (await harper.exportWords()).filter((w) => !gone.has(w));
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

export const withoutWord = (harper, word, create) => withoutWords(harper, [word], create);
