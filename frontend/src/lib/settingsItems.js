// The merge rules for a synced set (docs/sync.md, "Settings"): the personal dictionary (words) and the ignore list (finding hashes). A set is a map
//   {"<item>": {at, del}}
// where `at` is the time (Unix ms) the item was last added or removed on a device and `del` marks a removal (a tombstone). Pure
// functions; no storage and no network.

const MAX_WORD = 64;
const isHash = (h) => typeof h === "string" && /^\d{1,20}$/.test(h);
const isWord = (w) => typeof w === "string" && w.length > 0 && [...w].length <= MAX_WORD && !/[\s\p{Cc}]/u.test(w);

// The map in a server document, {"v":1,"items":{...}}. The server's text is untrusted: anything that is not a well-formed word entry
// is dropped (for the ignore list an item is a decimal hash), and a document that does not parse is an empty set (it adds nothing and removes nothing).
export function parseItems(data, key = "words") {
  const valid = key === "ignored" ? isHash : isWord;
  let blob;
  try {
    blob = JSON.parse(data);
  } catch {
    return {};
  }
  const out = {};
  if (blob?.v !== 1 || !blob.items || typeof blob.items !== "object") return out;
  for (const [item, v] of Object.entries(blob.items)) {
    if (valid(item) && Number.isFinite(v?.at) && v.at >= 0 && typeof v.del === "boolean") out[item] = { at: v.at, del: v.del };
  }
  return out;
}

export const itemsData = (items) => JSON.stringify({ v: 1, items });

// Notes this device's own changes: `current` is the words the dictionary holds now. A word that is new here (or was removed here and
// is back) is stamped `now`; a word that was present and is gone is a tombstone stamped `now`. Words that have not changed keep their time.
export function reconcile(items, current, now) {
  const out = { ...items };
  const have = new Set(current);
  for (const w of have) if (!out[w] || out[w].del) out[w] = { at: now, del: false };
  for (const [w, v] of Object.entries(items)) if (!v.del && !have.has(w)) out[w] = { at: now, del: true };
  return out;
}

// Two sets into one: per item the later change wins, and at the same time the word stays (a removal has to be newer to count). So a
// removal on one device is not undone by a device that still has the word, and a word added after a removal comes back.
export function mergeItems(a, b) {
  const out = { ...a };
  for (const [w, v] of Object.entries(b)) {
    const mine = out[w];
    if (!mine || v.at > mine.at || (v.at === mine.at && mine.del && !v.del)) out[w] = v;
  }
  return out;
}

export const sameItems = (a, b) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((w) => b[w] && b[w].at === a[w].at && b[w].del === a[w].del);
};

// What the dictionary must do to match `items`: words to add, and words to remove (Harper can only add; the caller rebuilds the linter).
export function changesFor(items, current) {
  const have = new Set(current);
  return {
    add: Object.keys(items).filter((w) => !items[w].del && !have.has(w)),
    remove: current.filter((w) => items[w]?.del),
  };
}
