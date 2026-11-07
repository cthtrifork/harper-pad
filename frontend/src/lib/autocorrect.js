// Autocorrect: which Harper findings are safe to fix without asking, and the user's choices. No CodeMirror or Vue in here, so it is
// easy to test (autocorrect.test.js).

// What may be fixed. A finding is safe only when Harper has exactly one suggestion for it: with several (recieved -> received, relieved,
// receive) the right one is a judgement, so it stays in the Problems panel for the user.
export const CATEGORIES = [
  { id: "typos", label: "Typos with one clear fix", example: "teh → the" },
  { id: "caps", label: "Capitalisation", example: "i → I" },
  { id: "reps", label: "Repeated words", example: "the the → the" },
  { id: "spaces", label: "Extra spaces", example: "two  spaces → two spaces" },
];

// Off until the user turns it on: nothing changes their text unasked.
export const DEFAULT_PREFS = { on: false, typos: true, caps: true, reps: true, spaces: true };

// The category a finding belongs to, or null when it is never auto-fixed (grammar, style, anything with several suggestions or that
// would only insert text).
export function categoryOf(finding) {
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

// A fix that only puts spaces where there were more of them (or none), such as "  " -> " ".
export const isSpacing = (fix) => fix.kind === "replace" && fix.text !== "" && fix.text.trim() === "";

// Spaces that mean something in Markdown: indentation at the start of a line (nested lists, code blocks) and two or more spaces at the
// end of a line (a hard line break). Autocorrect leaves these alone, even though Harper calls them extra spaces.
export function isMarkdownSpacing(text, from, to) {
  return from === 0 || text[from - 1] === "\n" || text[to] === "\n" || text[to] === "\r";
}

export function isSafe(finding, prefs) {
  const cat = categoryOf(finding);
  return cat !== null && prefs[cat] === true;
}

// A letter, digit or one of the characters that continue a word: the finding is complete only when the character after it is none of
// these, so a word the user is still typing is left alone.
const WORD_CHAR = /[\p{L}\p{N}_'’-]/u;

// Whether the finding at from..to is finished: the character after it is not part of a word, and the caret is already past that
// character (so the user has typed the space or punctuation, not just reached the end of the word).
export function isFinished(text, to, caret) {
  if (to >= text.length) return false;
  return !WORD_CHAR.test(text[to]) && caret > to;
}

// Add a range to a sorted list of ranges, merging the ones that overlap or touch. Used to remember which parts of the text the user
// has typed or pasted: autocorrect only fixes findings there, never in text that was already in the draft.
export function addRange(ranges, from, to) {
  const out = [];
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

export const touches = (ranges, from, to) => ranges.some(([x, y]) => from <= y && to >= x);

// Keep the findings that can be applied together: sorted by position, none overlapping the one before.
export function nonOverlapping(items) {
  const out = [];
  let end = -1;
  for (const it of [...items].sort((a, b) => a.from - b.from)) {
    if (it.from < end) continue;
    out.push(it);
    end = Math.max(end, it.to);
  }
  return out;
}

import { scoped } from "./scope.ts";

const KEY = scoped("harper-pad.autocorrect");

// The choices are kept in the browser storage the webview already has, on both builds. It can be unavailable (private window, blocked
// storage), so every access is guarded and the defaults apply.
export function loadPrefs(storage = globalThis.localStorage) {
  try {
    const saved = JSON.parse(storage?.getItem(KEY) ?? "null");
    if (saved && typeof saved === "object") {
      return Object.fromEntries(Object.entries(DEFAULT_PREFS).map(([k, d]) => [k, typeof saved[k] === "boolean" ? saved[k] : d]));
    }
  } catch {
    // unreadable or blocked: use the defaults
  }
  return { ...DEFAULT_PREFS };
}

export function savePrefs(prefs, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // the choice then only lasts until the window closes
  }
}
