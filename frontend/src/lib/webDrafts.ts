// DraftService's operations over IndexedDB, for the web build. A draft's text and its summary are two records in one transaction, so
// listing never reads the text. IDs, limits and messages match internal/store.
import { type IDBPDatabase, openDB } from "idb";
import type { Draft, List, Summary, SyncState } from "../../bindings/github.com/cthtrifork/harper-pad/internal/store";
import { withDb as sharedWithDb } from "./kv.ts";
import { contentHash } from "./contentHash.ts";
import { isProtected } from "./protect.ts";
import { summarize } from "./summarize.ts";

export const DB_NAME = "harper-pad";
export const DB_VERSION = 3; // 1 had only the key/value store used for settings, 2 added the drafts, 3 the sync state

const MAX_CONTENT_BYTES = 1 << 20;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 1000;
const ID = /^[0-9a-f]{32}$/;

// Migrations must only add object stores, and sync state stays out of the draft records: docs/pages.md, "Changing the schema".
function upgrade(db: IDBPDatabase) {
  if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
  if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
  if (!db.objectStoreNames.contains("summaries")) {
    db.createObjectStore("summaries", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
  }
  if (!db.objectStoreNames.contains("sync")) db.createObjectStore("sync", { keyPath: "id" });
}

// A database that is already newer (another build on the same origin migrated it) is opened as it is instead of failing with a
// VersionError.
export async function openDatabase(): Promise<IDBPDatabase> {
  try {
    return await openDB(DB_NAME, DB_VERSION, { upgrade });
  } catch (err) {
    if ((err as Error)?.name !== "VersionError") throw err;
    return openDB(DB_NAME);
  }
}

// 32 hex characters that sort by creation: 6 bytes of time, then 10 random.
function newId(now: number) {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

// What the "drafts" store keeps; the summary fields are in "summaries".
type StoredDraft = Pick<Draft, "id" | "format" | "content" | "createdAt" | "updatedAt" | "filePath">;

interface SyncRecord extends SyncState {
  id: string;
}

export function createWebDrafts(open: () => Promise<IDBPDatabase>) {
  const withDb = <T>(work: (db: IDBPDatabase) => Promise<T>) => sharedWithDb(open, work);

  const summaryOf = (d: Omit<StoredDraft, "filePath"> & { filePath?: string }) => ({
    id: d.id,
    format: d.format,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    filePath: d.filePath ?? "",
    ...summarize(d.content),
  });

  async function get(id: string): Promise<StoredDraft> {
    return withDb(async (db) => {
      const d = await db.get("drafts", id);
      if (!d) throw new Error("draft not found");
      return d;
    });
  }

  async function save(input: Partial<Draft>): Promise<StoredDraft> {
    const format = input.format || "markdown";
    if (format !== "markdown" && format !== "text") throw new Error(`unknown draft format "${format}"`);
    const content = input.content ?? "";
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_CONTENT_BYTES) throw new Error(`the draft is ${bytes} bytes; the limit is ${MAX_CONTENT_BYTES}`);
    const now = Date.now();
    let id = input.id as string;
    if (!id) id = newId(now);
    else if (!ID.test(id)) throw new Error(`"${id}" is not a draft id`);
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const existing = await drafts.get(id);
      // An id that is no longer stored is restored (undoing a delete), keeping the creation time when given.
      const createdAt = existing?.createdAt ?? (input.id && (input.createdAt ?? 0) > 0 ? (input.createdAt as number) : now);
      // Only setFilePath sets the file link, as on the Go side.
      const d = { id, format, content, createdAt, updatedAt: now, filePath: existing?.filePath ?? "" };
      await Promise.all([drafts.put(d), tx.objectStore("summaries").put(summaryOf(d)), tx.done]);
      return d;
    });
  }

  // The browser only knows the file name; backend.ts keeps the handle. "" clears it.
  async function setFilePath(id: string, filePath: string): Promise<StoredDraft> {
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const d = await drafts.get(id);
      if (!d) throw new Error("draft not found");
      d.filePath = filePath;
      await Promise.all([drafts.put(d), tx.objectStore("summaries").put(summaryOf(d)), tx.done]);
      return d;
    });
  }

  async function remove(id: string) {
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries"], "readwrite");
      await Promise.all([tx.objectStore("drafts").delete(id), tx.objectStore("summaries").delete(id), tx.done]);
    });
  }

  // Newest first; `matches` limits it to a search result.
  async function page(db: IDBPDatabase, matches: Set<string> | null, limit?: number, offset?: number): Promise<List> {
    limit = Math.min(limit && limit > 0 ? limit : DEFAULT_LIMIT, MAX_LIMIT);
    offset = Math.max(offset || 0, 0);
    const store = db.transaction("summaries").store;
    const total = matches ? matches.size : await store.count();
    const drafts: Summary[] = [];
    let skipped = 0;
    for (let cur = await store.index("byUpdated").openCursor(null, "prev"); cur && drafts.length < limit; cur = await cur.continue()) {
      if (matches && !matches.has(cur.value.id)) continue;
      if (skipped < offset) skipped++;
      else drafts.push(cur.value);
    }
    return { drafts, total };
  }

  async function list(limit?: number, offset?: number) {
    return withDb((db) => page(db, null, limit, offset));
  }

  // Case-insensitive; the only place the text is read, one draft at a time. A protected draft is ciphertext, so it matches on its title.
  async function search(query: string, limit?: number) {
    const q = query.trim().toLowerCase();
    if (!q) return list(limit, 0);
    return withDb(async (db) => {
      const matches = new Set<string>();
      const titles = new Map<string, string>();
      for await (const cur of db.transaction("summaries").store) titles.set(cur.value.id, cur.value.title);
      for await (const cur of db.transaction("drafts").store) {
        const text = isProtected(cur.value.content) ? (titles.get(cur.value.id) ?? "") : cur.value.content;
        if (text.toLowerCase().includes(q)) matches.add(cur.value.id);
      }
      return page(db, matches, limit, 0);
    });
  }

  // Only the keys, for Sync all.
  async function allIds() {
    return withDb((db) => db.getAllKeys("drafts") as Promise<string[]>);
  }

  // As PadService.Startup.
  async function startup() {
    const { drafts, total } = await list(1, 0);
    return { demo: "", open: drafts.length ? await get(drafts[0].id) : null, total, error: "" };
  }

  // --- Sync (docs/sync.md). A draft's state is a record in the "sync" store: what the server held at the last sync. Changes are found
  // by comparing hashes and a delete is a record with no draft, so edits by an older build are seen too. Same rules as internal/store/sync.go.

  async function syncState(id: string): Promise<SyncRecord | null> {
    return withDb(async (db) => ((await db.get("sync", id)) as SyncRecord | undefined) ?? null);
  }

  // `state.hash` is the hash of the text that was sent.
  async function markSynced(id: string, state: Partial<SyncState> & Pick<SyncState, "updatedAt" | "version">) {
    if (!ID.test(id)) throw new Error(`"${id}" is not a draft id`);
    return withDb(async (db) => {
      const tx = db.transaction("sync", "readwrite");
      await Promise.all([
        tx.objectStore("sync").put({
          id,
          hash: state.hash ?? "",
          updatedAt: state.updatedAt,
          deleted: !!state.deleted,
          version: state.version,
        }),
        tx.done,
      ]);
    });
  }

  // The one definition of "changed", used by changes() and isChanged() (docs/sync.md, "Changes to local storage").
  async function differsFromSynced(d: StoredDraft, state?: SyncRecord | null) {
    return !state?.hash || (await contentHash(d.format, d.content)) !== state.hash;
  }

  // For the push after a save; a draft that is not stored is not changed.
  async function isChanged(id: string) {
    const { d, state } = await withDb(async (db) => ({ d: await db.get("drafts", id), state: await db.get("sync", id) }));
    return !!d && differsFromSynced(d, state);
  }

  // Hashes each draft one at a time, so it is for Sync all.
  async function changes() {
    const { ids, states } = await withDb(async (db) => {
      const tx = db.transaction(["drafts", "sync"]);
      const [ids, records] = await Promise.all([tx.objectStore("drafts").getAllKeys(), tx.objectStore("sync").getAll()]);
      return { ids: (ids as string[]).sort(), states: new Map<string, SyncRecord>(records.map((r: SyncRecord) => [r.id, r])) };
    });
    const changed: string[] = [];
    for (const id of ids) {
      const d = await withDb((db) => db.get("drafts", id));
      if (d && (await differsFromSynced(d, states.get(id)))) changed.push(id);
    }
    const here = new Set(ids);
    const deleted = [...states.values()]
      .filter((r) => !r.deleted && !here.has(r.id))
      .map((r) => r.id)
      .sort();
    return { changed, deleted };
  }

  // Keeps the server's times (save would set the update time to now) and records the draft as synced.
  async function applyRemote(input: Partial<Draft>, version: number): Promise<StoredDraft> {
    return (await applyRemoteChecked(input, version)) as StoredDraft;
  }

  // As applyRemote, but only while the stored draft's update time is still `expected`, compared in the transaction that writes it.
  // false: the draft moved (or does not exist), nothing was written.
  async function applyRemoteIf(input: Partial<Draft>, version: number, expected: number): Promise<boolean> {
    return (await applyRemoteChecked(input, version, expected)) !== null;
  }

  async function applyRemoteChecked(input: Partial<Draft>, version: number, expected?: number): Promise<StoredDraft | null> {
    const format = input.format || "markdown";
    if (format !== "markdown" && format !== "text") throw new Error(`unknown draft format "${format}"`);
    const content = input.content ?? "";
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_CONTENT_BYTES) throw new Error(`the draft is ${bytes} bytes; the limit is ${MAX_CONTENT_BYTES}`);
    if (!ID.test(input.id ?? "")) throw new Error(`"${input.id}" is not a draft id`);
    if (!((input.createdAt ?? 0) > 0 && (input.updatedAt ?? 0) > 0)) throw new Error("a synced draft needs its created and updated times");
    const hash = await contentHash(format, content); // before the transaction: it would not wait for this
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries", "sync"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const existing = await drafts.get(input.id as string);
      if (expected !== undefined && existing?.updatedAt !== expected) {
        await tx.done;
        return null;
      }
      const d = {
        id: input.id as string,
        format,
        content,
        createdAt: input.createdAt as number,
        updatedAt: input.updatedAt as number,
        filePath: existing?.filePath ?? "",
      };
      await Promise.all([
        drafts.put(d),
        tx.objectStore("summaries").put(summaryOf(d)),
        tx.objectStore("sync").put({ id: d.id, hash, updatedAt: d.updatedAt, deleted: false, version }),
        tx.done,
      ]);
      return d;
    });
  }

  // The server's copy is a tombstone; recording it keeps this from being a pending delete.
  async function applyRemoteDelete(id: string, version: number, updatedAt: number) {
    if (!ID.test(id)) throw new Error(`"${id}" is not a draft id`);
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries", "sync"], "readwrite");
      await Promise.all([
        tx.objectStore("drafts").delete(id),
        tx.objectStore("summaries").delete(id),
        tx.objectStore("sync").put({ id, hash: "", updatedAt, deleted: true, version }),
        tx.done,
      ]);
    });
  }

  return {
    get,
    save,
    setFilePath,
    remove,
    list,
    search,
    startup,
    allIds,
    isChanged,
    syncState,
    markSynced,
    changes,
    applyRemote,
    applyRemoteIf,
    applyRemoteDelete,
  };
}
