// What the drafts list shows for a draft: its title, an excerpt, and a preview of its markdown task lines. This is the same
// work as `summarize` in internal/store/drafts.go (the desktop build does it in Go when a draft is saved); the web build, which has
// no Go side, does it here. Keep the two the same: both run the cases in internal/store/testdata/summarize.json (`npm test` here, TestSummarizeFixtures there), so add a case to that file when you change either.

const TASK = /^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$/;
const HEAD = /^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?)/;

// At most n characters (not UTF-16 units, so an emoji counts once), with an ellipsis when something was cut off.
function clip(s: string, n: number): string {
  const chars = Array.from(s);
  return chars.length <= n
    ? s
    : `${chars
        .slice(0, n - 1)
        .join("")
        .trimEnd()}…`;
}

export interface TaskLine {
  text: string;
  done: boolean;
}

export function summarize(content: string) {
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
    title: title || "Untitled",
    excerpt: clip(rest.join(" ").split(/\s+/).filter(Boolean).join(" "), 160),
    tasks,
    tasksTotal: total,
    tasksDone: done,
  };
}
