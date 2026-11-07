import type { IDBPDatabase } from "idb";

export type Open = () => Promise<IDBPDatabase>;

// `open` resolves to an open database; it is closed after each use.
export async function withDb<T>(open: Open, work: (db: IDBPDatabase) => Promise<T>): Promise<T> {
  const db = await open();
  try {
    return await work(db);
  } finally {
    db.close();
  }
}

// One value in the "kv" store. `load` gives null when there is none.
export function kvRecord<T>(open: Open, key: string) {
  return {
    load: () => withDb(open, async (db) => ((await db.get("kv", key)) as T | undefined) ?? null),
    save: (record: T) => withDb(open, (db) => db.put("kv", record, key)),
    clear: () => withDb(open, (db) => db.delete("kv", key)),
  };
}
