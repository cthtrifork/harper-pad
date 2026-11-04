// A small in-memory stand-in for IndexedDB, for the tests of webDrafts.js: object stores with a key path, get/put/delete/count/getAll
// /getAllKeys, and transactions that complete once their requests are done. No indexes or cursors (the list is not tested here).
export function fakeIndexedDb() {
  const stores = new Map(); // name -> Map(key -> value)
  const keyPaths = new Map();
  const db = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore(name, { keyPath } = {}) {
      stores.set(name, new Map());
      keyPaths.set(name, keyPath);
      return { createIndex() {} };
    },
    close() {},
    transaction(names) {
      names = [].concat(names);
      const tx = { oncomplete: null, onerror: null, onabort: null };
      let pending = 0;
      const settle = () => {
        if (pending === 0) setTimeout(() => pending === 0 && tx.oncomplete?.(), 0);
      };
      const run = (fn) => {
        const req = {};
        pending++;
        queueMicrotask(() => {
          req.result = fn();
          pending--;
          req.onsuccess?.();
          settle();
        });
        return req;
      };
      tx.objectStore = (name) => {
        if (!names.includes(name)) throw new Error(`store ${name} is not in this transaction`);
        const data = stores.get(name);
        const kp = keyPaths.get(name);
        return {
          get: (k) => run(() => structuredClone(data.get(k))),
          put: (v, k) => run(() => void data.set(kp ? v[kp] : k, structuredClone(v))),
          delete: (k) => run(() => void data.delete(k)),
          count: () => run(() => data.size),
          getAll: () => run(() => structuredClone([...data.values()])),
          getAllKeys: () => run(() => [...data.keys()]),
        };
      };
      return tx;
    },
  };
  return { db, stores };
}

// What webDrafts.js's `open` parameter expects: it resolves to the database, which the caller closes.
export function openFake() {
  const { db, stores } = fakeIndexedDb();
  return { open: async () => db, db, stores };
}
