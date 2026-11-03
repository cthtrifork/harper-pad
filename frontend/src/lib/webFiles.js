// Saving a draft to a file in the browser (the web build), the counterpart of PadService.SaveDraftToFile. The File System Access
// API (Chrome, Edge) lets the page keep a handle to the file, so later saves overwrite it without asking. Elsewhere (Firefox,
// Safari) the page can only download a copy, so the draft is never linked to a file there and "Save" keeps updating the draft.
import { summarize } from "./summarize.js";

const TYPES = [
  { description: "Markdown", accept: { "text/markdown": [".md"] } },
  { description: "Text", accept: { "text/plain": [".txt"] } },
];

const fileName = (title, format) => {
  const name =
    title
      .replace(/[^\p{L}\p{N}._ -]+/gu, "")
      .trim()
      .slice(0, 60)
      .trim() || "Untitled";
  return `${name}${format === "text" ? ".txt" : ".md"}`;
};

function download(name, content) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// `web` is createWebDrafts' result, `getHandle` and `putHandle` read and write a FileSystemFileHandle by draft id.
// Returns {draft, cancelled} like the Go side.
export async function saveWebFile(web, getHandle, putHandle, input, saveAs) {
  const draft = await web.save(input); // the draft first, so a failed file write leaves the text safe
  let handle = saveAs ? null : await getHandle(draft.id);
  if (!handle) {
    const name = fileName(summarize(draft.content).title, draft.format);
    if (!window.showSaveFilePicker) {
      download(name, draft.content);
      return { draft, cancelled: false };
    }
    try {
      handle = await window.showSaveFilePicker({ suggestedName: name, types: TYPES });
    } catch (err) {
      if (err?.name === "AbortError") return { draft: input, cancelled: true };
      throw err;
    }
  } else if ((await handle.queryPermission({ mode: "readwrite" })) !== "granted") {
    if ((await handle.requestPermission({ mode: "readwrite" })) !== "granted") throw new Error("permission to write the file was refused");
  }
  const w = await handle.createWritable();
  try {
    await w.write(draft.content);
  } finally {
    await w.close();
  }
  await putHandle(draft.id, handle);
  return { draft: await web.setFilePath(draft.id, handle.name), cancelled: false };
}
