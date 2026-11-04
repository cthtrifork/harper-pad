// The drafts in the browser (the web build, which has no Go side): the same operations as DraftService's methods, kept in
// IndexedDB. A draft's text and its summary are two records in one transaction, so listing reads only the small summaries and
// never the text, as the desktop database does. IDs, limits and messages match internal/store.
import { contentHash } from "./contentHash.js";
import { summarize } from "./summarize.js";

export const DB_NAME = "harper-pad";
export const DB_VERSION = 3; // 1 had only the key/value store used for settings, 2 added the drafts, 3 the sync state

const MAX_CONTENT_BYTES = 5 << 20;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const ID = /^[0-9a-f]{32}$/;

// Called by backend.js when it opens the database: adds what the newer versions need and leaves everything else as it is. Every change
// so far only adds an object store, so a build that is one version behind opens the database as it is (see openDatabase) and nothing is
// lost; keep it that way, and put sync state in its own store, never in the draft records, which an older build rewrites whole.
export function upgrade(db) {
  if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
  if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
  if (!db.objectStoreNames.contains("summaries")) {
    db.createObjectStore("summaries", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
  }
  if (!db.objectStoreNames.contains("sync")) db.createObjectStore("sync", { keyPath: "id" });
}

// Opens the database at DB_VERSION, creating or upgrading it. When the stored database is already newer (another build of the app on the
// same origin migrated it, for instance a preview of a branch), the browser refuses with a VersionError; this build then opens it as it
// is, which works as long as the newer migrations only added things (the usual case). `idb` is the IDBFactory, a parameter for the tests.
export function openDatabase(idb = indexedDB) {
  return new Promise((resolve, reject) => {
    const req = idb.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => upgrade(req.result);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      if (req.error?.name !== "VersionError") return reject(req.error);
      const current = idb.open(DB_NAME);
      current.onsuccess = () => resolve(current.result);
      current.onerror = () => reject(current.error);
    };
  });
}

// 32 hex characters that sort by creation: 6 bytes of the time in milliseconds, then 10 random bytes.
function newId(now) {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let t = now;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

const done = (tx) =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error("the transaction was aborted"));
  });

const request = (req) =>
  new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

// `open` is backend.js's openDb: it resolves to an open database, which the caller closes.
export function createWebDrafts(open) {
  async function withDb(work) {
    const db = await open();
    try {
      return await work(db);
    } finally {
      db.close();
    }
  }

  const summaryOf = (d) => ({
    id: d.id,
    format: d.format,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    filePath: d.filePath ?? "",
    ...summarize(d.content),
  });

  async function get(id) {
    return withDb(async (db) => {
      const d = await request(db.transaction("drafts").objectStore("drafts").get(id));
      if (!d) throw new Error("draft not found");
      return d;
    });
  }

  async function save(input) {
    const format = input.format || "markdown";
    if (format !== "markdown" && format !== "text") throw new Error(`unknown draft format "${format}"`);
    const content = input.content ?? "";
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_CONTENT_BYTES) throw new Error(`the draft is ${bytes} bytes; the limit is ${MAX_CONTENT_BYTES}`);
    const now = Date.now();
    let id = input.id;
    if (!id) id = newId(now);
    else if (!ID.test(id)) throw new Error(`"${id}" is not a draft id`);
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const existing = await request(drafts.get(id));
      // Saving an id that is no longer stored restores it (undoing a delete), keeping its creation time when one is given.
      const createdAt = existing?.createdAt ?? (input.id && input.createdAt > 0 ? input.createdAt : now);
      // The file link is only ever set by setFilePath, as on the Go side, so saving the text keeps it.
      const d = { id, format, content, createdAt, updatedAt: now, filePath: existing?.filePath ?? "" };
      drafts.put(d);
      tx.objectStore("summaries").put(summaryOf(d));
      await done(tx);
      return d;
    });
  }

  // The name of the file a draft was saved to ("" clears it); the browser only knows the name, the handle is kept by backend.js.
  async function setFilePath(id, filePath) {
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const d = await request(drafts.get(id));
      if (!d) throw new Error("draft not found");
      d.filePath = filePath;
      drafts.put(d);
      tx.objectStore("summaries").put(summaryOf(d));
      await done(tx);
      return d;
    });
  }

  async function remove(id) {
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries"], "readwrite");
      tx.objectStore("drafts").delete(id);
      tx.objectStore("summaries").delete(id);
      await done(tx);
    });
  }

  // Newest first. `matches`, when given, is the set of ids that match a search.
  async function page(db, matches, limit, offset) {
    limit = Math.min(limit > 0 ? limit : DEFAULT_LIMIT, MAX_LIMIT);
    offset = Math.max(offset || 0, 0);
    const store = db.transaction("summaries").objectStore("summaries");
    const total = matches ? matches.size : await request(store.count());
    const drafts = [];
    let skipped = 0;
    await new Promise((resolve, reject) => {
      const req = store.index("byUpdated").openCursor(null, "prev");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur || drafts.length >= limit) return resolve();
        if (!matches || matches.has(cur.value.id)) {
          if (skipped < offset) skipped++;
          else drafts.push(cur.value);
        }
        cur.continue();
      };
    });
    return { drafts, total };
  }

  async function list(limit, offset) {
    return withDb((db) => page(db, null, limit, offset));
  }

  // Drafts whose text contains the query, ignoring case. The text is only read here, one draft at a time.
  async function search(query, limit) {
    const q = query.trim().toLowerCase();
    if (!q) return list(limit, 0);
    return withDb(async (db) => {
      const matches = new Set();
      await new Promise((resolve, reject) => {
        const req = db.transaction("drafts").objectStore("drafts").openCursor();
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const cur = req.result;
          if (!cur) return resolve();
          if (cur.value.content.toLowerCase().includes(q)) matches.add(cur.value.id);
          cur.continue();
        };
      });
      return page(db, matches, limit, 0);
    });
  }

  // What the page needs to start: the most recent draft and how many there are (see PadService.Startup).
  async function startup() {
    const { drafts, total } = await list(1, 0);
    return { demo: "", open: drafts.length ? await get(drafts[0].id) : null, total, error: "" };
  }

  // --- Sync (docs/sync.md). The state of a draft is a record in the "sync" store: {id, hash, updatedAt, deleted, version}, what the
  // server held at the last sync. A change is found by comparing hashes, and a delete is a record with no draft (deleted false), so a
  // draft saved or deleted by an older build, which knows nothing of the store, is seen too. Same rules as internal/store/sync.go.

  async function syncState(id) {
    return withDb(async (db) => (await request(db.transaction("sync").objectStore("sync").get(id))) ?? null);
  }

  // Records what the server now holds for a draft: {hash, updatedAt, deleted, version}. Pass the hash of the text that was sent.
  async function markSynced(id, state) {
    if (!ID.test(id)) throw new Error(`"${id}" is not a draft id`);
    return withDb(async (db) => {
      const tx = db.transaction("sync", "readwrite");
      tx.objectStore("sync").put({
        id,
        hash: state.hash ?? "",
        updatedAt: state.updatedAt,
        deleted: !!state.deleted,
        version: state.version,
      });
      await done(tx);
    });
  }

  // What to push: {changed, deleted}, ids. It reads each draft's text to hash it, one at a time, so it is for Sync all.
  async function changes() {
    const { ids, states } = await withDb(async (db) => {
      const tx = db.transaction(["drafts", "sync"]);
      const [ids, records] = await Promise.all([request(tx.objectStore("drafts").getAllKeys()), request(tx.objectStore("sync").getAll())]);
      return { ids: ids.sort(), states: new Map(records.map((r) => [r.id, r])) };
    });
    const changed = [];
    for (const id of ids) {
      const state = states.get(id);
      if (!state?.hash) {
        changed.push(id);
        continue;
      }
      const d = await withDb((db) => request(db.transaction("drafts").objectStore("drafts").get(id)));
      if (d && (await contentHash(d.format, d.content)) !== state.hash) changed.push(id);
    }
    const here = new Set(ids);
    const deleted = [...states.values()]
      .filter((r) => !r.deleted && !here.has(r.id))
      .map((r) => r.id)
      .sort();
    return { changed, deleted };
  }

  // Stores a draft as the server has it, with the server's times (save sets the update time to now), and records it as synced.
  async function applyRemote(input, version) {
    const format = input.format || "markdown";
    if (format !== "markdown" && format !== "text") throw new Error(`unknown draft format "${format}"`);
    const content = input.content ?? "";
    const bytes = new TextEncoder().encode(content).length;
    if (bytes > MAX_CONTENT_BYTES) throw new Error(`the draft is ${bytes} bytes; the limit is ${MAX_CONTENT_BYTES}`);
    if (!ID.test(input.id ?? "")) throw new Error(`"${input.id}" is not a draft id`);
    if (!(input.createdAt > 0 && input.updatedAt > 0)) throw new Error("a synced draft needs its created and updated times");
    const hash = await contentHash(format, content); // before the transaction: it would not wait for this
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries", "sync"], "readwrite");
      const drafts = tx.objectStore("drafts");
      const existing = await request(drafts.get(input.id));
      const d = {
        id: input.id,
        format,
        content,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt,
        filePath: existing?.filePath ?? "",
      };
      drafts.put(d);
      tx.objectStore("summaries").put(summaryOf(d));
      tx.objectStore("sync").put({ id: d.id, hash, updatedAt: d.updatedAt, deleted: false, version });
      await done(tx);
      return d;
    });
  }

  // Removes a draft because the server's copy is a tombstone, and records that, so it is not a pending delete.
  async function applyRemoteDelete(id, version, updatedAt) {
    if (!ID.test(id)) throw new Error(`"${id}" is not a draft id`);
    return withDb(async (db) => {
      const tx = db.transaction(["drafts", "summaries", "sync"], "readwrite");
      tx.objectStore("drafts").delete(id);
      tx.objectStore("summaries").delete(id);
      tx.objectStore("sync").put({ id, hash: "", updatedAt, deleted: true, version });
      await done(tx);
    });
  }

  return { get, save, setFilePath, remove, list, search, startup, syncState, markSynced, changes, applyRemote, applyRemoteDelete };
}
