// The desktop build's drafts store for sync: the same nine operations as the web store (createWebDrafts in webDrafts.js), over the Go services
// instead of IndexedDB. The sync engine (syncRun.js) only sees this interface, so it is the same code on both builds. `bindings` is the
// backend.ts function that imports the generated Wails bindings on demand, so this file carries no Wails code into the web bundle.
//
// The names and shapes match the web store: syncState is null when the server never had the draft, changes is {changed, deleted}, and
// get rejects when there is no such draft. desktopSync.test.js checks that the two stores have the same operations.
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

type Bindings = Pick<typeof import("../../bindings/github.com/cthtrifork/harper-pad/internal/app"), "DraftService" | "SyncService">;

export function createDesktopSyncDrafts(bindings: () => Promise<Bindings>) {
  const drafts = async () => (await bindings()).DraftService;
  const sync = async () => (await bindings()).SyncService;
  return {
    get: async (id: string) => (await drafts()).GetDraft(id),
    save: async (draft: Draft) => (await drafts()).SaveDraft(draft),
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
    applyRemote: async (draft: Draft, version: number) => (await sync()).ApplyRemote(draft, version),
    applyRemoteDelete: async (id: string, version: number, updatedAt: number) => (await sync()).ApplyRemoteDelete(id, version, updatedAt),
  };
}
