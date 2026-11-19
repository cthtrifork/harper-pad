// Keeps the status line quiet while the draft is changing. Typing walks the raw line through "Unsaved changes", "Saving...", "Syncing..."
// and "Saved and synced" every few hundred milliseconds, which is a distraction in the corner of the eye and chatter for a screen reader.
// This shows nothing while work is going on and the outcome once it has been still for a moment. Things the writer must act on, or that
// would be wrong to delay (an error, "sign in again", "Newer on the server"), show at once. A save or sync that takes long still shows
// what it is doing, so a stuck one is not mistaken for silence.
import { type Ref, ref, watch } from "vue";

export interface Line {
  text: string;
  tone: "mute" | "ok" | "accent" | "bad";
}

/** How long the line must stay unchanged before a settled outcome ("Saved and synced") appears. */
export const SETTLE_MS = 800;
/** How long work in progress ("Saving...", "Syncing...") may go on before it is shown. */
export const SLOW_MS = 2500;

export function useCalmStatus(source: Ref<Line>, busy: Ref<boolean>, { settleMs = SETTLE_MS, slowMs = SLOW_MS } = {}) {
  const line = ref<Line>({ text: "", tone: "mute" });
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    () => [source.value.text, source.value.tone, busy.value] as const,
    ([text, tone, working]) => {
      clearTimeout(timer);
      if (!text || tone === "bad" || tone === "accent") {
        line.value = { text, tone };
        return;
      }
      if (line.value.text) line.value = { text: "", tone: "mute" }; // the old outcome is stale now that something changed
      timer = setTimeout(() => (line.value = { text, tone }), working ? slowMs : settleMs);
    },
    { immediate: true, flush: "sync" },
  );

  return line;
}
