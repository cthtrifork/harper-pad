// The pure part of personal.ts: changing Harper's dictionary and ignore list, so the sync wiring can be tested with a fake Harper.

// The parts of a Harper linter used here, so a fake can stand in.
interface IgnoreList {
  exportIgnoredLints(): Promise<string>;
  clearIgnoredLints(): Promise<void>;
  importIgnoredLints(json: string): Promise<void>;
}
export interface WordList extends IgnoreList {
  exportWords(): Promise<string[]>;
  importWords(words: string[]): Promise<void>;
  dispose(): Promise<void>;
}

// Harper exports {"context_hashes": [...]}. Read with a pattern: JSON.parse would round the 64-bit hashes.
export function hashesOf(json?: string | null): string[] {
  const list = /"context_hashes"\s*:\s*\[([^\]]*)\]/.exec(json ?? "");
  return list?.[1].match(/\d+/g) ?? [];
}

// Built by hand for the same reason.
export const exportList = (hashes: string[]) => `{"context_hashes":[${hashes.join(",")}]}`;

export async function ignoredHashes(harper: IgnoreList) {
  return hashesOf(await harper.exportIgnoredLints());
}

// Harper can only take the whole list back, so the others are put back after clearing it.
async function removeIgnoredMany(harper: IgnoreList, hashes: string[]) {
  const gone = new Set(hashes);
  const rest = (await ignoredHashes(harper)).filter((h) => !gone.has(h));
  await harper.clearIgnoredLints();
  if (rest.length) await harper.importIgnoredLints(exportList(rest));
}

export const removeIgnored = (harper: IgnoreList, hash: string) => removeIgnoredMany(harper, [hash]);

export async function applyIgnored(harper: IgnoreList, { add, remove }: { add: string[]; remove: string[] }) {
  if (remove.length) await removeIgnoredMany(harper, remove);
  if (add.length) await harper.importIgnoredLints(exportList(add));
}

// Harper cannot remove a word, so this builds a new linter with the words that stay; the caller swaps it in and disposes the old one.
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
