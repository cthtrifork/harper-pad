// The one line that says where the open draft's text is and who has it. It joins the draft's own state (useDrafts) with the sync state
// (useSync) so the two stop saying the same thing in two places; the Sync button only acts, and this says what is true.
//
// Without sync set up the draft's own text is used as it is (`draftText`), so nothing changes for a build or a person that does not sync.

// `draft`: {state, text, fileState, fileName, recreated} from useDrafts. `sync`: {enrolled, status, newer, rejected} from useSync (`newer` is true while a
// "Newer on the server" marker is up, `rejected` is {title, reason} while the server refuses the open draft). Returns {text, tone}: tone is "mute" (a neutral fact), "ok", "accent" or "bad".
export type Tone = "mute" | "ok" | "accent" | "bad";

export interface DraftStatus {
  state: string;
  text: string;
  fileState?: string;
  fileName?: string;
  recreated?: boolean;
}

export interface SyncStatus {
  enrolled: boolean;
  status?: string;
  newer?: boolean;
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
