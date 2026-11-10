// What the drafts list shows: title, excerpt and a preview of the task lines. Made here for both builds (docs/architecture.md, "Go side").
// Cases: testdata/summarize.json.
import { clearTitle, isProtected } from "./protect.ts";

const TASK = /^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$/;
const HEAD = /^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?)/;

// Counts characters, not UTF-16 units, so an emoji counts once.
function clip(s: string, n: number): string {
  const chars = Array.from(s);
  return chars.length <= n
    ? s
    : `${chars
        .slice(0, n - 1)
        .join("")
        .trimEnd()}…`;
}

interface TaskLine {
  text: string;
  done: boolean;
}

export function summarize(content: string) {
  // A protected draft shows no excerpt and no tasks, and the title the user gave it, if any (docs/sync.md, "Protected drafts").
  if (isProtected(content)) {
    return {
      protected: true,
      title: clearTitle(content) || "Locked draft",
      excerpt: "",
      tasks: [] as TaskLine[],
      tasksTotal: 0,
      tasksDone: 0,
    };
  }
  let title = "";
  let total = 0;
  let done = 0;
  const tasks: TaskLine[] = [];
  const rest: string[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.replace(/\r+$/, "");
    const m = TASK.exec(line);
    if (m) {
      total++;
      const isDone = m[1] !== " ";
      if (isDone) done++;
      if (tasks.length < 3) tasks.push({ text: clip(m[2], 120), done: isDone });
    }
    if (title === "") {
      if (line.trim() !== "") title = clip(line.trim().replace(HEAD, "").trim(), 80);
      continue;
    }
    if (!m) rest.push(line); // task lines are shown as tasks, so they stay out of the excerpt
  }
  return {
    protected: false,
    title: title || "Untitled",
    excerpt: clip(rest.join(" ").split(/\s+/).filter(Boolean).join(" "), 160),
    tasks,
    tasksTotal: total,
    tasksDone: done,
  };
}

// What the Go services take: DraftService.SaveDraft, SaveDraftToFile and SyncService.ApplyRemote.
export const withSummary = <T extends { content: string }>(draft: T) => ({ ...draft, ...summarize(draft.content) });
