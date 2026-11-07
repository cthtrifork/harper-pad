// Saving a draft to a file in the browser, the counterpart of DraftService.SaveDraftToFile. Chrome and Edge keep a handle to the
// file, so later saves overwrite it. Elsewhere the page can only hand over a copy (share sheet or download) and the draft is never
// linked to a file.
import { summarize } from "./summarize.ts";

const TYPES = [
  { description: "Markdown", accept: { "text/markdown": [".md"] } },
  { description: "Text", accept: { "text/plain": [".txt"] } },
];

// The file name offered for a draft, on the web and (passed to DraftService.SaveDraftToFile) on desktop. Cases: testdata/filename.json.
export const fileName = (title, format) => {
  const cleaned = title.replace(/[^\p{L}\p{N}._ -]+/gu, "").replace(/^[ .-]+|[ .-]+$/g, "");
  const name =
    Array.from(cleaned || "Untitled")
      .slice(0, 60)
      .join("")
      .trim() || "Untitled";
  return `${name}${format === "text" ? ".txt" : ".md"}`;
};

// True where Save hands the draft to the share sheet: no file picker, but the browser can share files.
export const sharesFiles = () =>
  !window.showSaveFilePicker && !!navigator.canShare?.({ files: [new File([""], "a.md", { type: "text/markdown" })] });

// Offers the text to the system share sheet as a file. Returns "shared", "cancelled", or "unsupported" when the browser cannot share files.
async function share(name, content) {
  const file = new File([content], name, { type: name.endsWith(".md") ? "text/markdown" : "text/plain" });
  if (!navigator.canShare?.({ files: [file] })) return "unsupported";
  try {
    await navigator.share({ files: [file], title: name });
    return "shared";
  } catch (err) {
    if (err?.name === "AbortError") return "cancelled";
    if (err?.name === "NotAllowedError") return "unsupported"; // the tap is too old to open the sheet: download instead
    throw err;
  }
}

function download(name, content) {
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
export async function saveWebFile(web, getHandle, putHandle, input, saveAs, overwrite = false) {
  const draft = await web.save(input); // the draft first, so a failed file write leaves the text safe
  const kept = saveAs ? null : await getHandle(draft.id);
  let handle = kept?.handle;
  if (!handle) {
    const name = fileName(summarize(draft.content).title, draft.format);
    if (!window.showSaveFilePicker) {
      if ((await share(name, draft.content)) === "unsupported") download(name, draft.content);
      return { draft, cancelled: false, conflict: false };
    }
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name, types: TYPES });
    } catch (err) {
      if (err?.name === "AbortError") return { draft: input, cancelled: true, conflict: false };
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
