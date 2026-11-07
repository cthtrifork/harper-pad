// What to do with one draft when syncing: the decision table in docs/sync.md ("Conflicts"). No network, storage or Vue in here, so the
// whole table is unit-tested. The sync module asks `decide` for every draft, then does what it answers.
//
// The three inputs, for one draft id:
//   local   null when this device has no such draft; otherwise {changed}: true when its text differs from the last sync, or it was never synced.
//   synced  the state recorded at the last sync, {updatedAt, deleted}, or null when it never was synced.
//   server  the state the server holds now, {updatedAt, deleted}, or null when it has no copy and no tombstone.
// A state is the pair (updatedAt, deleted). Only equality is tested, never order, so device clocks do not matter.
//
// The answers:
//   "none"             nothing to do (the caller may still record the server's state).
//   "upload"           PUT the local text. The base is the server's state, so this also revives a draft that was deleted elsewhere.
//   "upload-tombstone" PUT a tombstone for a draft deleted here.
//   "download"         GET the draft and save it without touching its timestamps (also drops a pending delete).
//   "remove-local"     the server's copy is a tombstone and this device has no edits: remove it here, with undo.
//   "resolve"          changed on both sides: GET the server's text, then `settle` says whether it is the same text or a conflict.

export type Action = "none" | "upload" | "upload-tombstone" | "download" | "remove-local" | "resolve";

interface State {
  updatedAt: number;
  deleted: boolean;
}

export function decide({
  local,
  synced,
  server,
}: {
  local: { changed: boolean } | null;
  synced: State | null;
  server: State | null;
}): Action {
  // Absence on the server is not a deletion: a device that has the draft uploads it (this is also how a lost server is rebuilt).
  if (!server) return local ? "upload" : "none";

  const serverChanged = !synced || synced.updatedAt !== server.updatedAt || synced.deleted !== server.deleted;

  if (local) {
    if (!local.changed) {
      if (!serverChanged) return "none";
      return server.deleted ? "remove-local" : "download";
    }
    if (!serverChanged) return "upload";
    return server.deleted ? "upload" : "resolve"; // an edit survives a deletion elsewhere
  }

  // No draft here. It is a pending delete when the last sync left it live on the server.
  const pendingDelete = !!synced && !synced.deleted;
  if (pendingDelete) {
    if (!serverChanged) return "upload-tombstone";
    return server.deleted ? "none" : "download"; // deleted on both sides, or an edit elsewhere survives the delete
  }
  return server.deleted ? "none" : "download";
}

// For "resolve": the same format and text on both sides adopts the server's state, with no copy; otherwise it is a conflict.
// Both arguments are contentHash values (lib/contentHash.ts), which cover the format as well as the text.
export const settle = (localHash: string, serverHash: string): "adopt" | "conflict" => (localHash === serverHash ? "adopt" : "conflict");
