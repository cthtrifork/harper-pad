// What this device remembers to sync its dictionary (docs/sync.md, "Settings"): one record in the "kv" store of the app's IndexedDB,
// under "sync-words" (the dictionary) and "sync-ignored" (the ignore list), the same on the web and on desktop, so there is no Go side. {items} is the map of words (or finding hashes) with the time of their
// last change and whether they were removed (settingsItems.js). It is never a source of words: the dictionary itself stays in
// SettingsService / IndexedDB "settings"; this only says when each word changed. A missing record means nothing is known yet.
export function createSettingsSyncStore(open, key) {
  const KEY = `sync-${key}`;
  async function withDb(work) {
    const db = await open();
    try {
      return await work(db);
    } finally {
      db.close();
    }
  }
  return {
    load: async () => withDb(async (db) => (await db.get("kv", KEY)) ?? { items: {} }),
    save: async (record) => withDb((db) => db.put("kv", record, KEY)),
  };
}
