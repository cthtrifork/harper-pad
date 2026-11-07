// This device's sync record: one entry in the "kv" store under "sync-device", never uploaded (docs/sync.md, "Key storage"). Missing means
// not enrolled.
import type { PublicJwk } from "./dpop.ts";
import { kvRecord, type Open } from "./kv.ts";

export interface DeviceRecord {
  server: string;
  token: string;
  privateKey: CryptoKey;
  publicJwk: PublicJwk;
}

// `clear` leaves the drafts and their sync state alone.
export const createDeviceStore = (open: Open) => kvRecord<DeviceRecord>(open, "sync-device");
