// The one line that says where the open draft's text is and who has it, joining useDrafts' state with useSync's so the two stop saying
// the same thing twice; the Sync button only acts. Without sync it is the draft's own text.

/** "mute" is a neutral fact. */
type Tone = "mute" | "ok" | "accent" | "bad";

interface DraftStatus {
  state: string;
  text: string;
  fileState?: string;
  fileName?: string;
  recreated?: boolean;
}

interface SyncStatus {
  enrolled: boolean;
  status?: string;
  /** A "Newer on the server" marker is up. */
  newer?: boolean;
  /** The server refuses the open draft. */
  rejected?: { title: string; reason: string } | null;
}

export function statusLine({ draft, sync }: { draft: DraftStatus; sync?: SyncStatus | null }): { text: string; tone: Tone } {
  const { state, text, fileState, fileName, recreated } = draft;
  if (state === "error") return { text, tone: "bad" };
  if (state === "saving") return { text: "Saving...", tone: "mute" };
  if (state === "dirty") return { text: "Unsaved changes", tone: "mute" };
  if (state !== "saved") return { text: "", tone: "mute" };

  if (!sync?.enrolled) return { text, tone: "mute" };

  if (sync.rejected) return { text: `Could not sync ${sync.rejected.title}: ${sync.rejected.reason}`, tone: "bad" };
  if (sync.newer) return { text: "Newer on the server", tone: "accent" };
  const file = fileName ? { synced: fileState === "synced", stale: fileState === "stale" } : { synced: false, stale: false };
  switch (sync.status) {
    case "syncing":
      return { text: "Syncing...", tone: "mute" };
    case "offline":
      return { text: "Saved, offline", tone: "mute" };
    case "signin":
      return { text: "Saved, sign in again", tone: "bad" };
    case "pending":
      return { text: "Saved, not synced yet", tone: "mute" };
    default:
      if (file.stale) return { text: `Synced, ${fileName} not updated`, tone: "mute" };
      if (file.synced && recreated) return { text: `Recreated ${fileName}`, tone: "ok" };
      if (file.synced) return { text: `Synced, written to ${fileName}`, tone: "ok" };
      return { text: "Saved and synced", tone: "ok" };
  }
}
