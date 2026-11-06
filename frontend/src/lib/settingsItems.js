// The synced settings document (docs/sync.md, "Settings"): the whole dictionary and the whole ignore list, as the last device to write
// left them: {"v":1,"words":["Wails"],"ignored":["18446744073709551615"]}. Hashes are decimal text because Harper's are 64-bit. Pure
// functions; no storage and no network.

const MAX_WORD = 64;
const isHash = (h) => typeof h === "string" && /^\d{1,20}$/.test(h);
const isWord = (w) => typeof w === "string" && w.length > 0 && [...w].length <= MAX_WORD && !/[\s\p{Cc}]/u.test(w);

const sorted = (list) => [...new Set(list)].sort();

// The text to store for the lists held now.
export const settingsData = ({ words, ignored }) => JSON.stringify({ v: 1, words: sorted(words), ignored: sorted(ignored) });

// The lists in a server document, or null when it is not a well-formed one. The server's text is untrusted, and since a list now
// replaces the local one, a document with anything wrong in it is refused as a whole rather than read in part.
export function parseSettings(data) {
  let blob;
  try {
    blob = JSON.parse(data);
  } catch {
    return null;
  }
  if (blob?.v !== 1 || !Array.isArray(blob.words) || !Array.isArray(blob.ignored)) return null;
  if (!blob.words.every(isWord) || !blob.ignored.every(isHash)) return null;
  return { words: sorted(blob.words), ignored: sorted(blob.ignored) };
}

export function sameSet(a, b) {
  const x = new Set(a);
  const y = new Set(b);
  return x.size === y.size && [...x].every((v) => y.has(v));
}

export const sameLists = (a, b) => sameSet(a.words, b.words) && sameSet(a.ignored, b.ignored);

// What each local list must do to become `to`: items to add and items to remove (Harper can only add; the caller rebuilds the linter).
export function changesTo(to, now) {
  const diff = (target, have) => ({ add: target.filter((v) => !have.includes(v)), remove: have.filter((v) => !target.includes(v)) });
  const words = diff(to.words, now.words);
  const ignored = diff(to.ignored, now.ignored);
  return { words, ignored, any: !!(words.add.length || words.remove.length || ignored.add.length || ignored.remove.length) };
}
