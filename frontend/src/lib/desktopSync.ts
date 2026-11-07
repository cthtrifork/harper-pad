// The web store's sync operations (webDrafts.ts) over the Go services, so syncRun.ts is the same code on both builds. `bindings` imports
// the Wails bindings on demand, so no Wails code reaches the web bundle. desktopSync.test.ts checks the two stores have the same operations.
export const SYNC_STORE_METHODS = [
  "get",
  "save",
  "allIds",
  "isChanged",
  "changes",
  "syncState",
  "markSynced",
  "applyRemote",
  "applyRemoteDelete",
];

import type { Draft, SyncState } from "../../bindings/github.com/cthtrifork/harper-pad/internal/store";
import { withSummary } from "./summarize.ts";

type Bindings = Pick<typeof import("../../bindings/github.com/cthtrifork/harper-pad/internal/app"), "DraftService" | "SyncService">;

export function createDesktopSyncDrafts(bindings: () => Promise<Bindings>) {
  const drafts = async () => (await bindings()).DraftService;
  const sync = async () => (await bindings()).SyncService;
  return {
    get: async (id: string) => (await drafts()).GetDraft(id),
    save: async (draft: Draft) => (await drafts()).SaveDraft(withSummary(draft)),
    allIds: async () => (await sync()).AllDraftIDs(),
    isChanged: async (id: string) => (await sync()).DraftChanged(id),
    changes: async () => (await sync()).DraftChanges(),
    syncState: async (id: string) => (await sync()).DraftSyncState(id),
    // As the web store does: a missing hash is "", and deleted is a boolean.
    markSynced: async (id: string, state: Partial<SyncState> & Pick<SyncState, "updatedAt" | "version">) =>
      (await sync()).MarkSynced(id, {
        hash: state.hash ?? "",
        updatedAt: state.updatedAt,
        deleted: !!state.deleted,
        version: state.version,
      }),
    applyRemote: async (draft: Draft, version: number) => (await sync()).ApplyRemote(withSummary(draft), version),
    applyRemoteDelete: async (id: string, version: number, updatedAt: number) => (await sync()).ApplyRemoteDelete(id, version, updatedAt),
  };
}
