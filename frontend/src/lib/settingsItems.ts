// The synced dictionary and ignore list (docs/sync.md, "Dictionary and ignore list"). Hashes are decimal text because Harper's are 64-bit.
// Pure functions.

const MAX_WORD = 64;
const isHash = (h: unknown): h is string => typeof h === "string" && /^\d{1,20}$/.test(h);
const isWord = (w: unknown): w is string => typeof w === "string" && w.length > 0 && [...w].length <= MAX_WORD && !/[\s\p{Cc}]/u.test(w);

const sorted = (list: Iterable<string>) => [...new Set(list)].sort();

// Leaves out an entry another device would refuse to read (readSettings refuses a list with one in it whole); it stays in the local
// dictionary, it is only not shared.
interface Lists {
  words: string[];
  ignored: string[];
}

export function cleanLists({ words, ignored }: { words: unknown[]; ignored: unknown[] }): Lists {
  return {
    words: sorted(words.map((w) => String(w).trim()).filter(isWord)),
    ignored: sorted(ignored.map((h) => String(h).trim()).filter(isHash)),
  };
}

// null unless well formed. The server's lists are untrusted and replace the local ones, so one bad entry refuses the whole.
export function readSettings(body: { words?: unknown; ignored?: unknown } | null | undefined): Lists | null {
  if (!Array.isArray(body?.words) || !Array.isArray(body?.ignored)) return null;
  if (!body.words.every(isWord) || !body.ignored.every(isHash)) return null;
  return { words: sorted(body.words), ignored: sorted(body.ignored) };
}

function sameSet(a: Iterable<string>, b: Iterable<string>) {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

export const unionLists = (a: Lists, b: Lists): Lists => ({
  words: sorted([...a.words, ...b.words]),
  ignored: sorted([...a.ignored, ...b.ignored]),
});

export const sameLists = (a: Lists, b: Lists) => sameSet(a.words, b.words) && sameSet(a.ignored, b.ignored);

// Harper can only add, so the caller rebuilds the linter for `remove`.
export function changesTo(to: Lists, now: Lists) {
  const diff = (target: string[], have: string[]) => ({
    add: target.filter((v) => !have.includes(v)),
    remove: have.filter((v) => !target.includes(v)),
  });
  const words = diff(to.words, now.words);
  const ignored = diff(to.ignored, now.ignored);
  return { words, ignored, any: !!(words.add.length || words.remove.length || ignored.add.length || ignored.remove.length) };
}
