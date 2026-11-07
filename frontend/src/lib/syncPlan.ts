// The decision table of docs/sync.md ("The decision for one draft"). Pure, so the whole table is unit-tested. Only equality of
// (updatedAt, deleted) is tested, never order, so device clocks do not matter.

type Action =
  | "none" // the caller may still record the server's state
  | "upload" // also revives a draft that was deleted elsewhere
  | "upload-tombstone"
  | "download" // saved without touching its timestamps; also drops a pending delete
  | "remove-local" // the server has a tombstone and this device has no edits; with undo
  | "resolve"; // changed on both sides: `settle` says whether the texts are the same

// `local` is null without the draft here, else whether it changed since the last sync; `synced` is the state recorded then (null if never
// synced), `server` the state it holds now (null with no copy and no tombstone).
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

// For "resolve", with contentHash values (format and text): the same on both sides adopts the server's state, with no copy.
export const settle = (localHash: string, serverHash: string): "adopt" | "conflict" => (localHash === serverHash ? "adopt" : "conflict");
