// The synced settings (docs/sync.md, "Settings"): the whole dictionary and the whole ignore list, as the last device to write left them,
// {words: ["Wails"], ignored: ["18446744073709551615"]}. Hashes are decimal text because Harper's are 64-bit. Pure functions; no storage
// and no network.

const MAX_WORD = 64;
const isHash = (h: unknown): h is string => typeof h === "string" && /^\d{1,20}$/.test(h);
const isWord = (w: unknown): w is string => typeof w === "string" && w.length > 0 && [...w].length <= MAX_WORD && !/[\s\p{Cc}]/u.test(w);

const sorted = (list: Iterable<string>) => [...new Set(list)].sort();

// The lists to sync, from what Harper holds: surrounding spaces are trimmed, repeats and empty entries dropped, and an entry that another
// device would refuse to read (a phrase, a control character, a word over the length limit) is left out: readSettings refuses lists with
// one in them whole. It stays in the local dictionary; it is only not shared.
export interface Lists {
  words: string[];
  ignored: string[];
}

export function cleanLists({ words, ignored }: { words: unknown[]; ignored: unknown[] }): Lists {
  return {
    words: sorted(words.map((w) => String(w).trim()).filter(isWord)),
    ignored: sorted(ignored.map((h) => String(h).trim()).filter(isHash)),
  };
}

// The lists in what the server returned ({words, ignored}), or null when they are not well formed. The server's lists are untrusted, and
// since they now replace the local ones, any bad entry refuses the whole of them rather than being read in part.
export function readSettings(body: { words?: unknown; ignored?: unknown } | null | undefined): Lists | null {
  if (!Array.isArray(body?.words) || !Array.isArray(body?.ignored)) return null;
  if (!body.words.every(isWord) || !body.ignored.every(isHash)) return null;
  return { words: sorted(body.words), ignored: sorted(body.ignored) };
}

export function sameSet(a: Iterable<string>, b: Iterable<string>) {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

// Both lists of two sets joined: nothing in either is dropped.
export const unionLists = (a: Lists, b: Lists): Lists => ({
  words: sorted([...a.words, ...b.words]),
  ignored: sorted([...a.ignored, ...b.ignored]),
});

export const sameLists = (a: Lists, b: Lists) => sameSet(a.words, b.words) && sameSet(a.ignored, b.ignored);

// What each local list must do to become `to`: items to add and items to remove (Harper can only add; the caller rebuilds the linter).
export function changesTo(to: Lists, now: Lists) {
  const diff = (target: string[], have: string[]) => ({
    add: target.filter((v) => !have.includes(v)),
    remove: have.filter((v) => !target.includes(v)),
  });
  const words = diff(to.words, now.words);
  const ignored = diff(to.ignored, now.ignored);
  return { words, ignored, any: !!(words.add.length || words.remove.length || ignored.add.length || ignored.remove.length) };
}
