// What the format (markdown or text) adds to the editor. The markdown side (markdownMode.ts) pulls in the markdown parser and the HTML,
// JavaScript and CSS ones it nests, about 230 KB of source that the first paint does not need: the editor appears as plain text and
// gets the markdown highlighting when this file's loader has fetched it (loadMarkdownMode, called after the first paint).
import type { Extension } from "@codemirror/state";

let markdownMode: typeof import("./markdownMode.ts") | null = null;
let loading: Promise<void> | null = null;

// Resolves once markdownMode.ts is loaded; every caller shares the one import.
export function loadMarkdownMode() {
  loading ??= import("./markdownMode.ts").then((m) => {
    markdownMode = m;
  });
  return loading;
}

export const markdownLoaded = () => markdownMode !== null;

export interface Mode {
  format: "markdown" | "text";
  /** The Split view's source pane. */
  source: boolean;
}

// Until the markdown side has loaded, a markdown draft gets no extensions (it looks like plain text).
export function modeExtensions({ format, source }: Mode): Extension[] {
  if (format === "text" || !markdownMode) return [];
  return markdownMode.markdownExtensions(source);
}
