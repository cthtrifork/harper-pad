// What the last sync of the dictionary and ignore list matched (docs/sync.md, "Dictionary and ignore list"), so the next one can tell
// "changed here" from "changed elsewhere". One "kv" entry under "sync-settings"; never a source of words. null means never synced:
// the server's copy wins.
import { kvRecord, type Open } from "./kv.ts";

export interface SettingsSyncRecord {
  version: number;
  words: string[];
  ignored: string[];
}

export const createSettingsSyncStore = (open: Open) => kvRecord<SettingsSyncRecord>(open, "sync-settings");
