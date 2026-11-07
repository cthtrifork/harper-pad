// Counts for the status bar. Both work on the CodeMirror document directly, so no keystroke builds the whole text as a string.

import type { EditorState, Text } from "@codemirror/state";

const PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;

// Words (runs of non-space characters) and characters (UTF-16 code points, so an emoji counts once, and every line break counts
// one) in a document. A word never spans lines, so counting line by line gives the same answer as counting the joined text.
export function countDoc(doc: Text) {
  let words = 0;
  let pairs = 0;
  for (const line of doc.iterLines()) {
    // Runs of non-space: count where a non-space character follows a space or the line start. No array, no substrings.
    let inWord = false;
    for (let i = 0; i < line.length; i++) {
      const space = isSpace(line.charCodeAt(i));
      if (!space && !inWord) words++;
      inWord = !space;
    }
    pairs += line.match(PAIR)?.length ?? 0;
  }
  return { words, chars: doc.length - pairs };
}

// The same set of characters as \s.
function isSpace(c: number) {
  return (
    c === 32 ||
    (c >= 9 && c <= 13) ||
    c === 160 ||
    c === 0x1680 ||
    (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 ||
    c === 0x2029 ||
    c === 0x202f ||
    c === 0x205f ||
    c === 0x3000 ||
    c === 0xfeff
  );
}

// 1-based line and column, in characters.
export function cursorOf(state: EditorState) {
  const { head, from, to } = state.selection.main;
  const line = state.doc.lineAt(head);
  return {
    line: line.number,
    col: codePoints(line.text.slice(0, head - line.from)) + 1,
    selected: from === to ? 0 : codePoints(state.sliceDoc(from, to)),
  };
}

function codePoints(text: string) {
  return text.length - (text.match(PAIR)?.length ?? 0);
}
