// The head of main (/preview/) and pull-request previews (docs/pages.md) are served from the production origin under /preview/ and /pr-<number>/. Browser storage is per origin, so
// without this a preview would change the real site's localStorage settings. A preview gets its own localStorage keys; production (any
// other base path) keeps the plain names. The IndexedDB database (dictionary, drafts) is NOT scoped: a preview works on the real data.
const match = /\/(pr-\d+|preview)\/$/.exec(import.meta.env?.BASE_URL ?? "/");

export const PREVIEW = match ? match[1] : "";

// "harper-pad.autocorrect" -> "harper-pad.autocorrect" in production, "harper-pad.autocorrect.pr-123" in preview pr-123.
export const scoped = (name: string) => (PREVIEW ? `${name}.${PREVIEW}` : name);
