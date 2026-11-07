// The pure part of personal.js: reading and changing what Harper holds (its dictionary and its ignore list), with no storage in it, so
// the sync wiring can be tested with a fake Harper. Harper's exported ignore list is {"context_hashes": [...]}.

// The parts of a Harper linter used here (harper.js's Linter has more), so a fake can stand in for it in tests.
export interface IgnoreList {
  exportIgnoredLints(): Promise<string>;
  clearIgnoredLints(): Promise<void>;
  importIgnoredLints(json: string): Promise<void>;
}
export interface WordList extends IgnoreList {
  exportWords(): Promise<string[]>;
  importWords(words: string[]): Promise<void>;
  dispose(): Promise<void>;
}

// The hashes in Harper's exported ignore list, as text. Read with a pattern, not JSON.parse, which would round them (they are 64-bit).
export function hashesOf(json?: string | null): string[] {
  const list = /"context_hashes"\s*:\s*\[([^\]]*)\]/.exec(json ?? "");
  return list?.[1].match(/\d+/g) ?? [];
}

// The same list as text, built by hand for the same reason.
export const exportList = (hashes: string[]) => `{"context_hashes":[${hashes.join(",")}]}`;

export async function ignoredHashes(harper: IgnoreList) {
  return hashesOf(await harper.exportIgnoredLints());
}

// Stop ignoring findings: Harper can only take the whole list back, so put the others back after clearing it.
export async function removeIgnoredMany(harper: IgnoreList, hashes: string[]) {
  const gone = new Set(hashes);
  const rest = (await ignoredHashes(harper)).filter((h) => !gone.has(h));
  await harper.clearIgnoredLints();
  if (rest.length) await harper.importIgnoredLints(exportList(rest));
}

export const removeIgnored = (harper: IgnoreList, hash: string) => removeIgnoredMany(harper, [hash]);

// What syncing the ignore list decided: import the hashes another device ignored, clear the ones it stopped ignoring.
export async function applyIgnored(harper: IgnoreList, { add, remove }: { add: string[]; remove: string[] }) {
  if (remove.length) await removeIgnoredMany(harper, remove);
  if (add.length) await harper.importIgnoredLints(exportList(add));
}

// Harper can add words to its dictionary but not take one out. To remove words, build a new linter with the words that stay (and the
// same ignore list) and return it; the caller swaps it in and disposes the old one.
export async function withoutWords<L extends WordList>(
  harper: WordList & IgnoreList,
  remove: string[],
  create: () => Promise<L>,
): Promise<L> {
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

export const withoutWord = <L extends WordList>(harper: WordList & IgnoreList, word: string, create: () => Promise<L>) =>
  withoutWords(harper, [word], create);
