// What the format (markdown or text) adds to the editor. The markdown side (markdownMode.js) pulls in the markdown parser and the HTML,
// JavaScript and CSS ones it nests, about 230 KB of source that the first paint does not need: the editor appears as plain text and
// gets the markdown highlighting when this file's loader has fetched it (loadMarkdownMode, called after the first paint).
let markdownMode = null;
let loading = null;

// Resolves once markdownMode.js is loaded; every caller shares the one import.
export function loadMarkdownMode() {
  loading ??= import("./markdownMode.js").then((m) => {
    markdownMode = m;
  });
  return loading;
}

export const markdownLoaded = () => markdownMode !== null;

// `mode` is { format: "markdown" | "text", source: boolean }; `source` is the Split view's source pane. Until the markdown side has
// loaded, a markdown draft gets no extensions (it looks like plain text).
export function modeExtensions({ format, source }) {
  if (format === "text" || !markdownMode) return [];
  return markdownMode.markdownExtensions(source);
}
