// The one question for a draft that disagrees with its file, with the server, or with both: Keep or Overwrite. No Vue, no network and no
// storage in here, so the rules are unit-tested; `useConflict.js` wires them to the page.
//
// The draft always keeps its id and its file link. "Yours" is the draft's text; when the draft has no edits of its own and only the file
// changed, the file's text is "yours" (`applyFile`: the draft takes it first).
//
//   Overwrite  your text is written to the file first (a failed write is skipped and reported, never a trap), then sent to the server.
//              The other versions are lost, with no undo.
//   Keep       first every other version that differs from yours is saved as a new, ordinary, unlinked draft (a "Conflicted copy": one
//              from the file, one from the server, or one when both hold the same text; none for a side that does not differ or does not
//              exist), then your text goes out exactly as for Overwrite.
//
// The model: {id, name, yours, file, server, applyFile, sync}, where `sync` says whether sync is on (the words mention the server then), and `file` and `server` are null (that side has no conflict) or {text, stamp}.

// The badge text for a Conflicted copy, by where its text came from. Only ever shown, never saved, synced or put into the text.
export const COPY_LABELS = {
  file: "Conflicted copy, from the file",
  server: "Conflicted copy, from the server",
  "file and server": "Conflicted copy, from the file and the server",
};

const stampOf = (side) => (side ? side.stamp : null);

import { whenStamp } from "./when.js";

// The versions involved, one row each, in the order draft, file, server (never more than three). Rows: {kind, label, when, tint}. `when` is the
// version's timestamp from `whenStamp` ("22:36" today, "6 Nov, 22:36" otherwise), or "–" when it is not known (`m.draftAt`, `m.file.at` and
// `m.server.at` are times in ms). The draft's row is tinted; an unedited draft has no row of its own, and the file's row is tinted instead
// because the file's text counts as yours.
export function summaryRows(m, now = new Date()) {
  const when = (ms) => (Number.isFinite(ms) && ms > 0 ? whenStamp(ms, now) : "–");
  return [
    !m.applyFile && { kind: "draft", label: "Your draft", when: when(m.draftAt), tint: true },
    m.file && { kind: "file", label: m.name || "The file", when: when(m.file.at), tint: !!m.applyFile },
    m.server && { kind: "server", label: "The server", when: when(m.server.at), tint: false },
  ].filter(Boolean);
}

const sameText = (m) => !!m.file && !!m.server && m.file.text === m.server.text;

// The words of the dialog. The title, the two button labels and one footer line are what is seen; the two sentences for the buttons are
// their tooltips and what assistive technology reads. `versions` is how many rows there are (2 or 3).
export function describeConflict(m) {
  const fileName = m.name || "the file";
  const fileOther = !!m.file && !m.applyFile; // an unedited draft takes the file's text: the file is not an "other" version then
  const versions = summaryRows(m).length;
  const title = m.applyFile
    ? "Two versions differ"
    : fileOther && m.server
      ? "Three versions differ"
      : fileOther
        ? `${m.name || "The file"} changed on disk`
        : "This draft changed on another device";

  const others = fileOther && m.server ? (sameText(m) ? 1 : 2) : fileOther || m.server ? 1 : 0;
  const otherNames = [fileOther && `the text now in ${fileName}`, m.server && "the server's text"].filter(Boolean);
  const targets = [fileOther && fileName, (m.server || m.sync) && "the server"].filter(Boolean).join(" and ") || "where it belongs";
  const yours = m.applyFile ? `${fileName}'s text` : "your draft";
  const copies = !others ? "" : fileOther && m.server && !sameText(m) ? "as two Conflicted copies" : "as a Conflicted copy";
  const losing = others === 0 ? "" : others === 1 ? "the other version" : "the other versions";

  return {
    title,
    versions,
    keepLabel: versions === 3 ? "Keep all" : "Keep both",
    overwriteLabel: versions === 3 ? "Overwrite others" : "Overwrite",
    keepTitle: others
      ? `Keeps ${otherNames.join(" and ")} ${copies}, then updates ${targets} with ${yours}.`
      : `Nothing else differs, so no copy is made. Updates ${targets} with ${yours}.`,
    overwriteTitle: others
      ? `Deletes ${losing} (${otherNames.join(" and ")}). No undo. Updates ${targets} with ${yours}.`
      : `Nothing else differs, so nothing is deleted. Updates ${targets} with ${yours}.`,
    footer: m.applyFile
      ? `${m.name || "The file"} counts as yours: your draft has no edits. Overwrite cannot be undone.`
      : "Overwrite cannot be undone.",
  };
}

// The versions Keep saves as copies: [{text, from}] with from "file", "server" or "file and server". A side whose text equals yours has no copy.
export function copiesFor(m) {
  const file = m.file && !m.applyFile && m.file.text !== m.yours ? m.file : null;
  const server = m.server && m.server.text !== m.yours ? m.server : null;
  if (file && server && file.text === server.text) return [{ text: file.text, from: "file and server" }];
  return [file && { text: file.text, from: "file" }, server && { text: server.text, from: "server" }].filter(Boolean);
}

// Carries out the choice. `ops`:
//   recheck()            -> {file, server}: the current stamps of both sides ({stamp} or null), looked at now.
//   applyFile(text)      the draft takes the file's text (only when model.applyFile).
//   saveCopy(text, from) saves a new unlinked draft and returns its id.
//   writeFile()          writes the draft to its file (rejects with the reason when it cannot; null when the draft has no file).
//   push()               sends the draft to the server (null when sync is off); resolves to false when it did not go.
// Resolves to {status: "stale", changed: ["file" and/or "server"]} when either side moved since the dialog was drawn (nothing was written: the caller redraws), or
// {status: "done", copies: [{id, from}], fileError, pushed}.
export async function resolveConflict(choice, m, ops) {
  const now = await ops.recheck();
  const changed = [stampOf(now.file) !== stampOf(m.file) && "file", stampOf(now.server) !== stampOf(m.server) && "server"].filter(Boolean);
  if (changed.length) return { status: "stale", changed };

  // From the first step that changes anything, a failure is no longer "nothing was changed" (err.untouched says which it is).
  let acted = false;
  try {
    if (m.applyFile) {
      acted = true;
      await ops.applyFile(m.file.text);
    }

    const copies = [];
    if (choice === "keep") {
      for (const c of copiesFor(m)) {
        acted = true;
        copies.push({ id: await ops.saveCopy(c.text, c.from), from: c.from });
      }
    }

    let fileError = "";
    if (ops.writeFile && !m.applyFile) {
      acted = true;
      try {
        await ops.writeFile();
      } catch (err) {
        fileError = String(err?.message || err); // skipped: the chip says why, and the server push goes on
      }
    }

    acted = true;
    const pushed = ops.push ? await ops.push() : null;
    return { status: "done", copies, fileError, pushed };
  } catch (err) {
    err.untouched = !acted;
    throw err;
  }
}

// What the dialog says when a side changed again since it was drawn: names the side, and asks to look again.
export function staleNote(m, changed) {
  const names = [changed.includes("file") && (m.name || "The file"), changed.includes("server") && "the server"].filter(Boolean);
  const who = names.join(" and ").replace(/^the /, "The "); // a file name keeps its own case
  return `${who} changed again. Check the rows and choose again.`;
}
