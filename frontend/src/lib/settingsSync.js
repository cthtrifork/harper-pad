// What this device remembers to sync its dictionary and ignore list (docs/sync.md, "Settings"): one record in the "kv" store of the
// app's IndexedDB under "sync-settings", the same on the web and on desktop, so there is no Go side. {version, words, ignored} is the
// server's version this device last matched and the lists it held then, which is how the next sync tells "changed here" from "changed
// elsewhere". It is never a source of words: the dictionary itself stays in SettingsService / IndexedDB "settings". null means this
// device has never synced them (just enrolled): the server's copy wins then.
export function createSettingsSyncStore(open) {
  const KEY = "sync-settings";
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
    clear: async () => withDb((db) => db.delete("kv", KEY)),
  };
}
