// Previews (docs/pages.md) share the production origin, so they get their own localStorage keys. The IndexedDB database is not scoped:
// a preview works on the real data.
const match = /\/(pr-\d+|preview)\/$/.exec(import.meta.env?.BASE_URL ?? "/");

export const PREVIEW = match ? match[1] : "";

// "harper-pad.autocorrect" in production, "harper-pad.autocorrect.pr-123" in preview pr-123.
export const scoped = (name: string) => (PREVIEW ? `${name}.${PREVIEW}` : name);
