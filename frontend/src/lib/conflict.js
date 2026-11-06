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

// What the dialog says: which versions differ, and whose text each choice loses. Plain and specific.
export function describeConflict(m) {
  const both = !!m.file && !!m.server;
  const file = m.name ? m.name : "the file";
  const title = both
    ? `${file} and the server both differ from your draft`
    : m.file
      ? `${file} changed on disk`
      : "This draft changed on another device";
  const fileOther = m.file && !m.applyFile; // an unedited draft takes the file's text: it is not an "other" version then
  const same = fileOther && m.server && sameText(m); // one text, held by the file and the server: said once
  const others = same
    ? [`the text now in ${file}, which matches the server's text,`]
    : [fileOther && `the text now in ${file}`, m.server && "the server's text"].filter(Boolean);
  const othersText = others.join(" and ");
  const yours = m.applyFile ? `${file}'s text` : "your draft's text";
  const detail = m.applyFile
    ? `Your draft has no edits of its own, so ${file}'s text counts as yours.`
    : both
      ? "Your draft, the file and the server each hold different text."
      : m.file
        ? `Your draft and ${file} hold different text.`
        : "Your draft and the server hold different text.";
  const sendsTo = [fileOther && file, (m.server || m.sync) && "the server"].filter(Boolean);
  const where = sendsTo.length > 1 ? `${sendsTo[0]} and ${sendsTo[1]}` : (sendsTo[0] ?? "where it belongs");
  const verb = others.length > 1 ? "are" : "is";
  const cap = othersText ? `${othersText[0].toUpperCase()}${othersText.slice(1)}` : "";
  // Nothing else differs (an unedited draft whose file is the only version): there is nothing to copy and nothing to lose.
  if (!othersText) {
    return {
      title,
      detail,
      keep: `Keep: ${yours} goes to ${where}. Nothing else differs, so no Conflicted copy is made.`,
      overwrite: `Overwrite: ${yours} goes to ${where}. Nothing else differs, so nothing is lost.`,
    };
  }
  return {
    title,
    detail,
    keep: `Keep: ${yours} goes to ${where}. ${cap} ${verb} saved first as ${copiesText(m)}.`,
    overwrite: `Overwrite: ${yours} goes to ${where}. ${cap} ${verb} lost for good, with no undo.`,
  };
}

const sameText = (m) => !!m.file && !!m.server && m.file.text === m.server.text;

function copiesText(m) {
  if (m.file && !m.applyFile && m.server) return sameText(m) ? "one Conflicted copy" : "two Conflicted copies";
  return "a Conflicted copy";
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
// Resolves to {status: "stale"} when either side moved since the dialog was drawn (nothing was written: the caller redraws), or
// {status: "done", copies: [{id, from}], fileError, pushed}.
export async function resolveConflict(choice, m, ops) {
  const now = await ops.recheck();
  if (stampOf(now.file) !== stampOf(m.file) || stampOf(now.server) !== stampOf(m.server)) return { status: "stale" };

  if (m.applyFile) await ops.applyFile(m.file.text);

  const copies = [];
  if (choice === "keep") {
    for (const c of copiesFor(m)) copies.push({ id: await ops.saveCopy(c.text, c.from), from: c.from });
  }

  let fileError = "";
  if (ops.writeFile && !m.applyFile) {
    try {
      await ops.writeFile();
    } catch (err) {
      fileError = String(err?.message || err); // skipped: the chip says why, and the server push goes on
    }
  }

  const pushed = ops.push ? await ops.push() : null;
  return { status: "done", copies, fileError, pushed };
}
