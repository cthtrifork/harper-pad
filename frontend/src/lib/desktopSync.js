// @ts-check
// The desktop build's drafts store for sync: the same nine operations as the web store (createWebDrafts in webDrafts.js), over the Go services
// instead of IndexedDB. The sync engine (syncRun.js) only sees this interface, so it is the same code on both builds. `bindings` is the
// backend.js function that imports the generated Wails bindings on demand, so this file carries no Wails code into the web bundle.
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

/**
 * @typedef {import("../../bindings/github.com/cthtrifork/harper-pad/internal/app")} Bindings
 * @typedef {import("../../bindings/github.com/cthtrifork/harper-pad/internal/store").Draft} Draft
 * @typedef {import("../../bindings/github.com/cthtrifork/harper-pad/internal/store").SyncState} SyncState
 * @typedef {{
 *   get(id: string): Promise<Draft>,
 *   save(draft: Draft): Promise<Draft>,
 *   allIds(): Promise<string[]>,
 *   isChanged(id: string): Promise<boolean>,
 *   changes(): Promise<import("../../bindings/github.com/cthtrifork/harper-pad/internal/store").Changes>,
 *   syncState(id: string): Promise<SyncState | null>,
 *   markSynced(id: string, state: Partial<SyncState> & Pick<SyncState, "updatedAt" | "version">): Promise<void>,
 *   applyRemote(draft: Draft, version: number): Promise<Draft>,
 *   applyRemoteDelete(id: string, version: number, updatedAt: number): Promise<void>,
 * }} SyncDrafts
 */

/**
 * @param {() => Promise<Pick<Bindings, "DraftService" | "SyncService">>} bindings
 * @returns {SyncDrafts}
 */
export function createDesktopSyncDrafts(bindings) {
  const drafts = async () => (await bindings()).DraftService;
  const sync = async () => (await bindings()).SyncService;
  return {
    get: async (id) => (await drafts()).GetDraft(id),
    save: async (draft) => (await drafts()).SaveDraft(draft),
    allIds: async () => (await sync()).AllDraftIDs(),
    isChanged: async (id) => (await sync()).DraftChanged(id),
    changes: async () => (await sync()).DraftChanges(),
    syncState: async (id) => (await sync()).DraftSyncState(id),
    // As the web store does: a missing hash is "", and deleted is a boolean.
    markSynced: async (id, state) =>
      (await sync()).MarkSynced(id, {
        hash: state.hash ?? "",
        updatedAt: state.updatedAt,
        deleted: !!state.deleted,
        version: state.version,
      }),
    applyRemote: async (draft, version) => (await sync()).ApplyRemote(draft, version),
    applyRemoteDelete: async (id, version, updatedAt) => (await sync()).ApplyRemoteDelete(id, version, updatedAt),
  };
}
