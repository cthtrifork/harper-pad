// Saving a draft to a file in the browser, the counterpart of DraftService.SaveDraftToFile. Chrome and Edge keep a handle to the
// file, so later saves overwrite it. Elsewhere the page can only hand over a copy (share sheet or download) and the draft is never
// linked to a file.
import type { Draft } from "../../bindings/github.com/cthtrifork/harper-pad/internal/store";
import { summarize } from "./summarize.ts";
import type { createWebDrafts } from "./webDrafts.ts";

// The File System Access API (Chrome and Edge), which lib.dom.d.ts does not declare.
export interface FileHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  queryPermission(options: { mode: "readwrite" }): Promise<string>;
  requestPermission(options: { mode: "readwrite" }): Promise<string>;
}
type PickerWindow = Window & {
  showSaveFilePicker?: (options: { suggestedName: string; types: typeof TYPES }) => Promise<FileHandle>;
};
const picker = () => window as PickerWindow;

export interface KeptHandle {
  handle: FileHandle;
  modified: number;
}

const TYPES = [
  { description: "Markdown", accept: { "text/markdown": [".md"] } },
  { description: "Text", accept: { "text/plain": [".txt"] } },
];

// The file name offered for a draft, on the web and (passed to DraftService.SaveDraftToFile) on desktop. Cases: testdata/filename.json.
// At most 60 characters before the extension: a longer title ends at the last word that fits (when that keeps at least half of it, else it
// is cut), and no name ends in a space, dot or dash.
const MAX_NAME = 60;
export const fileName = (title: string, format: string) => {
  const cleaned = title.replace(/[^\p{L}\p{N}._ -]+/gu, "").replace(/^[ .-]+|[ .-]+$/g, "");
  const chars = Array.from(cleaned || "Untitled");
  let kept = chars.slice(0, MAX_NAME);
  const space = kept.lastIndexOf(" ");
  if (chars.length > MAX_NAME && chars[MAX_NAME] !== " " && space >= MAX_NAME / 2) kept = kept.slice(0, space);
  const name = kept.join("").replace(/[ .-]+$/, "") || "Untitled";
  return `${name}${format === "text" ? ".txt" : ".md"}`;
};

// True where Save hands the draft to the share sheet: no file picker, but the browser can share files.
export const sharesFiles = () =>
  !picker().showSaveFilePicker && !!navigator.canShare?.({ files: [new File([""], "a.md", { type: "text/markdown" })] });

// Offers the text to the system share sheet as a file. Returns "shared", "cancelled", or "unsupported" when the browser cannot share files.
async function share(name: string, content: string) {
  const file = new File([content], name, { type: name.endsWith(".md") ? "text/markdown" : "text/plain" });
  if (!navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], title: name });
    return "shared";
  } catch (err) {
    if ((err as Error)?.name === "AbortError") return "cancelled";
    if ((err as Error)?.name === "NotAllowedError") return "unsupported"; // the tap is too old to open the sheet: download instead
    throw err;
  }
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// `web` is createWebDrafts' result, `getHandle` and `putHandle` read and write what is kept per draft id: {handle, modified}, the
// FileSystemFileHandle and the file's lastModified after our last write. Returns {draft, cancelled, conflict} like the Go side:
// when the file changed since we wrote it, nothing is written unless `overwrite` is set.
export async function saveWebFile(
  web: ReturnType<typeof createWebDrafts>,
  getHandle: (id: string) => Promise<KeptHandle | undefined>,
  putHandle: (id: string, kept: KeptHandle) => Promise<unknown>,
  input: Partial<Draft>,
  saveAs: boolean,
  overwrite = false,
) {
  const draft = await web.save(input); // the draft first, so a failed file write leaves the text safe
  const kept = saveAs ? null : await getHandle(draft.id);
  let handle: FileHandle | undefined = kept?.handle;
  if (!handle) {
    const name = fileName(summarize(draft.content).title, draft.format);
    const w = picker();
    if (!w.showSaveFilePicker) {
      if ((await share(name, draft.content)) === "unsupported") download(name, draft.content);
      return { draft, cancelled: false, conflict: false };
    }
    try {
      handle = await w.showSaveFilePicker({ suggestedName: name, types: TYPES });
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return { draft: input, cancelled: true, conflict: false };
      throw err;
    }
  } else if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permission to write the file was refused");
  }
  if (kept && !overwrite) {
    // A file that is gone is written again; one that changed is left alone.
    const file = await handle.getFile().catch(() => null);
    if (file && file.lastModified !== kept.modified) return { draft: await web.get(draft.id), cancelled: false, conflict: true };
  }
  const w = await handle.createWritable();
  try {
    await w.write(draft.content);
  } finally {
    await w.close();
  }
  await putHandle(draft.id, { handle, modified: (await handle.getFile()).lastModified });
  return { draft: await web.setFilePath(draft.id, handle.name), cancelled: false, conflict: false };
}
