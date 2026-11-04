// The drafts in the browser (the web build, which has no Go side): the same operations as DraftService's methods, kept in
// IndexedDB. A draft's text and its summary are two records in one transaction, so listing reads only the small summaries and
// never the text, as the desktop database does. IDs, limits and messages match internal/store.
import { scoped } from "./scope.js";
import { summarize } from "./summarize.js";

export const DB_NAME = scoped("harper-pad");
export const DB_VERSION = 2; // 1 had only the key/value store used for settings

const MAX_CONTENT_BYTES = 5 << 20;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;
const ID = /^[0-9a-f]{32}$/;

// Called by backend.js when it opens the database: adds what version 2 needs and leaves everything else as it is.
export function upgrade(db) {
  if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
  if (!db.objectStoreNames.contains("drafts")) db.createObjectStore("drafts", { keyPath: "id" });
  if (!db.objectStoreNames.contains("summaries")) {
    db.createObjectStore("summaries", { keyPath: "id" }).createIndex("byUpdated", "updatedAt");
  }
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

  return { get, save, setFilePath, remove, list, search, startup };
}
