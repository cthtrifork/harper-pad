// Which Harper findings are safe to fix without asking, and the user's choices. A finding is safe only with exactly one suggestion: with
// several (recieved -> received, relieved, receive) the right one is a judgement, so it stays in the Problems panel.
export const CATEGORIES = [
  { id: "typos", label: "Typos with one clear fix", example: "teh → the" },
  { id: "caps", label: "Capitalisation", example: "i → I" },
  { id: "reps", label: "Repeated words", example: "the the → the" },
  { id: "spaces", label: "Extra spaces", example: "two  spaces → two spaces" },
];

// Off until turned on: nothing changes their text unasked.
export const DEFAULT_PREFS = { on: false, typos: true, caps: true, reps: true, spaces: true };

export type Prefs = typeof DEFAULT_PREFS;
type Category = "typos" | "caps" | "reps" | "spaces";

// null when it is never auto-fixed (grammar, style, several suggestions, or only inserting text).
export function categoryOf(finding: Finding): Category | null {
  if (finding.fixes.length !== 1 || finding.fixes[0].kind === "insert") return null;
  switch (finding.kind) {
    case "Typo":
    case "Spelling":
      return "typos";
    case "Capitalization":
      return "caps";
    case "Repetition":
      return "reps";
    case "Formatting":
      return isSpacing(finding.fixes[0]) ? "spaces" : null;
    default:
      return null;
  }
}

// Only changes the amount of spacing, such as "  " -> " ".
export const isSpacing = (fix: Fix) => fix.kind === "replace" && fix.text !== "" && fix.text.trim() === "";

// Indentation and trailing double spaces (a hard line break) mean something in Markdown, though Harper calls them extra spaces.
export function isMarkdownSpacing(text: string, from: number, to: number) {
  return from === 0 || text[from - 1] === "\n" || text[to] === "\n" || text[to] === "\r";
}

export function isSafe(finding: Finding, prefs: Prefs) {
  const cat = categoryOf(finding);
  return cat !== null && prefs[cat] === true;
}

// A finding is complete only when the next character is none of these, so a word still being typed is left alone.
const WORD_CHAR = /[\p{L}\p{N}_'’-]/u;

// The next character is not part of a word and the caret is past it: the space or punctuation was typed.
export function isFinished(text: string, to: number, caret: number) {
  if (to >= text.length) return false;
  return !WORD_CHAR.test(text[to]) && caret > to;
}

// Merges overlapping or touching ranges. They remember what the user typed or pasted: autocorrect never fixes text that was in the draft.
export function addRange(ranges: Range[], from: number, to: number): Range[] {
  const out: Range[] = [];
  let a = from;
  let b = to;
  for (const [x, y] of ranges) {
    if (y < a || x > b) out.push([x, y]);
    else {
      a = Math.min(a, x);
      b = Math.max(b, y);
    }
  }
  out.push([a, b]);
  return out.sort((p, q) => p[0] - q[0]);
}

export const touches = (ranges: Range[], from: number, to: number) => ranges.some(([x, y]) => from <= y && to >= x);

// Sorted by position, none overlapping the one before.
export function nonOverlapping<T extends { from: number; to: number }>(items: T[]): T[] {
  const out: T[] = [];
  let end = -1;
  for (const it of [...items].sort((a, b) => a.from - b.from)) {
    if (it.from < end) continue;
    out.push(it);
    end = Math.max(end, it.to);
  }
  return out;
}

import type { Finding, Fix } from "./harperCore.ts";
import { scoped } from "./scope.ts";

type Range = [number, number];

const KEY = scoped("harper-pad.autocorrect");

// Storage can be unavailable (private window), so every access is guarded and the defaults apply.
export function loadPrefs(storage: Pick<Storage, "getItem"> = globalThis.localStorage): Prefs {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object") {
      return Object.fromEntries(Object.entries(DEFAULT_PREFS).map(([k, d]) => [k, typeof saved[k] === "boolean" ? saved[k] : d])) as Prefs;
    }
  } catch {
    // unreadable or blocked: use the defaults
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(prefs: Prefs, storage: Pick<Storage, "setItem"> = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // the choice then only lasts until the window closes
  }
}
