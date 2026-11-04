// The hash a draft is compared by to find out whether it changed since the last sync: SHA-256, in hex, of the format, a newline and
// the text, as UTF-8. The Go side (store.ContentHash) computes the same value; both check internal/store/testdata/contenthash.json.
export async function contentHash(format, content) {
  const bytes = new TextEncoder().encode(`${format}\n${content}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
