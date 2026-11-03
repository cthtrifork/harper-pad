// Does this text look like markdown? Used to offer "Looks like Markdown. Switch?" on a plain-text draft; it never switches by
// itself. Two or more lines of markdown structure (a heading, a list item, a fence, a quote, or a link) are needed, so a
// stray "-" or "#" in ordinary text does not trigger it.
const MARKS = [/^#{1,6}\s+\S/, /^\s*([-*+]|\d+[.)])\s+\S/, /^\s*```/, /^>\s?\S/, /\[[^\]]+\]\(https?:\/\/[^)\s]+\)/, /\*\*[^*\n]+\*\*/];

export function looksLikeMarkdown(text) {
  let hits = 0;
  for (const line of text.split("\n", 500)) {
    if (MARKS.some((re) => re.test(line)) && ++hits >= 2) return true;
  }
  return false;
}
