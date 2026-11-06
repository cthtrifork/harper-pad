// Harper's ignore list is exported as {"context_hashes": [...]} with 64-bit hashes, which do not fit a JS number. They are read with a
// pattern and written by hand, never through JSON.parse, which would round them.

// The hashes in an exported ignore list, as text.
export function hashesOf(json) {
  const list = /"context_hashes"\s*:\s*\[([^\]]*)\]/.exec(json ?? "");
  return list?.[1].match(/\d+/g) ?? [];
}

// The same list as text.
export const exportList = (hashes) => `{"context_hashes":[${hashes.join(",")}]}`;
