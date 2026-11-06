// What this device keeps to sync (docs/sync.md, "Changes to local storage"): one record in the existing "kv" store of the app's IndexedDB,
// under "sync-device". It is the same on the web and on desktop (the webview's IndexedDB), so there is no Go side and no schema change.
//   {server, token, privateKey, publicJwk}
// server is the origin the invite named, token the device token, privateKey the non-extractable CryptoKey (lib/dpop.js) and publicJwk its
// public half. It is never uploaded. A missing record means this device is not enrolled.
//
// `open` is backend.js's openDb: it resolves to an open database, which the caller closes.
const KEY = "sync-device";

export function createDeviceStore(open) {
  async function withDb(work) {
    const db = await open();
    try {
      return await work(db);
    } finally {
      db.close();
    }
  }

  return {
    load: async () => withDb(async (db) => (await db.get("kv", KEY)) ?? null),
    save: async (record) => withDb((db) => db.put("kv", record, KEY)),
    // Forget this device (after "Sign in again", or when sync is turned off). The drafts and their sync state are left alone.
    clear: async () => withDb((db) => db.delete("kv", KEY)),
  };
}
