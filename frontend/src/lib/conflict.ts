// Keep or Overwrite: the rules for a draft that disagrees with its file, the server, or both (what each choice does is in docs/sync.md, "The Keep
// or Overwrite dialog"). No Vue, no network and no storage in here, so the rules are unit-tested; `useConflict.js` wires them to the page.
//
// The model: {id, name, yours, file, server, applyFile, sync}. `file` and `server` are null (that side has no conflict) or {text, stamp, at}.
// `applyFile` is true when the draft has no edits of its own and only the file changed: the file's text is "yours" and the draft takes it first.
// `sync` says whether sync is on.

// The badge text for a Conflicted copy, by where its text came from (docs/sync.md).
export const COPY_LABELS: Record<string, string> = {
  file: "Conflicted copy, from the file",
  server: "Conflicted copy, from the server",
  "file and server": "Conflicted copy, from the file and the server",
};

export interface Side {
  text: string;
  stamp: string;
  at?: number;
}

export interface ConflictModel {
  id?: string;
  name?: string;
  yours?: string;
  draftAt?: number;
  file: Side | null;
  server: Side | null;
  applyFile?: boolean;
  sync?: boolean;
}

export interface Row {
  kind: "draft" | "file" | "server";
  label: string;
  when: string;
  tint: boolean;
}

export type Choice = "keep" | "overwrite";
export type Origin = "file" | "server" | "file and server";

const stampOf = (side: { stamp: string } | null | undefined) => (side ? side.stamp : null);

import { whenStamp } from "./when.ts";

// The versions involved, one row each, in the order draft, file, server (never more than three). Rows: {kind, label, when, tint}. `when` is the
// version's timestamp from `whenStamp` ("6 Nov, 22:36", always with the date), or "–" when it is not known (`m.draftAt`, `m.file.at` and
// `m.server.at` are times in ms). The draft's row is tinted; an unedited draft has no row of its own, and the file's row is tinted instead
// because the file's text counts as yours.
export function summaryRows(m: ConflictModel, now = new Date()): Row[] {
  const when = (ms?: number) => (ms !== undefined && Number.isFinite(ms) && ms > 0 ? whenStamp(ms, now) : "–");
  return [
    !m.applyFile && { kind: "draft", label: "Your draft", when: when(m.draftAt), tint: true },
    m.file && { kind: "file", label: m.name || "The file", when: when(m.file.at), tint: !!m.applyFile },
    m.server && { kind: "server", label: "The server", when: when(m.server.at), tint: false },
  ].filter((row): row is Row => !!row);
}

const sameText = (m: ConflictModel) => !!m.file && !!m.server && m.file.text === m.server.text;

// The words of the dialog. The title, the two button labels and one footer line are what is seen; one short sentence per button is its tooltip
// and what assistive technology reads (what each choice updates is in the labels and in docs/sync.md). `versions` is how many rows there are.
export function describeConflict(m: ConflictModel) {
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
  const copies = others === 2 ? "two Conflicted copies" : "a Conflicted copy";
  const other = others === 1 ? "the other version" : "the other versions";

  return {
    title,
    versions,
    keepLabel: versions === 3 ? "Keep all" : "Keep both",
    // Names what is replaced: the file, the server, or both of them ("others"). With three versions the draft's own row is one of them.
    overwriteLabel: versions === 3 ? "Overwrite others" : fileOther ? "Overwrite file" : "Overwrite server",
    keepTitle: others ? `Keeps ${other} as ${copies}.` : "Nothing else differs, so no copy is made.",
    overwriteTitle: others ? `Deletes ${other}. No undo.` : "Nothing else differs, so nothing is deleted.",
    footer: m.applyFile
      ? `${m.name || "The file"} counts as yours: your draft has no edits. Overwrite cannot be undone.`
      : "Overwrite cannot be undone.",
  };
}

// The versions Keep saves as copies: [{text, from}] with from "file", "server" or "file and server". A side whose text equals yours has no copy.
export function copiesFor(m: ConflictModel): { text: string; from: Origin }[] {
  const file = m.file && !m.applyFile && m.file.text !== m.yours ? m.file : null;
  const server = m.server && m.server.text !== m.yours ? m.server : null;
  if (file && server && file.text === server.text) return [{ text: file.text, from: "file and server" }];
  const copies: { text: string; from: Origin }[] = [];
  if (file) copies.push({ text: file.text, from: "file" });
  if (server) copies.push({ text: server.text, from: "server" });
  return copies;
}

// Carries out the choice. `ops`:
//   recheck()            -> {file, server}: the current stamps of both sides ({stamp} or null), looked at now.
//   applyFile(text)      the draft takes the file's text (only when model.applyFile).
//   saveCopy(text, from) saves a new unlinked draft and returns its id.
//   writeFile()          writes the draft to its file (rejects with the reason when it cannot; null when the draft has no file).
//   push()               sends the draft to the server (null when sync is off); resolves to false when it did not go.
// Resolves to {status: "stale", changed: ["file" and/or "server"]} when either side moved since the dialog was drawn (nothing was written: the caller redraws), or
// {status: "done", copies: [{id, from}], fileError, pushed}.
export interface ConflictOps {
  recheck(): Promise<{ file: { stamp: string } | null; server: { stamp: string } | null }>;
  applyFile(text: string): Promise<unknown>;
  saveCopy(text: string, from: Origin): Promise<string>;
  writeFile?: (() => Promise<unknown>) | null;
  push?: (() => Promise<boolean>) | null;
}

export async function resolveConflict(choice: Choice, m: ConflictModel, ops: ConflictOps) {
  const now = await ops.recheck();
  const changed = [stampOf(now.file) !== stampOf(m.file) && "file", stampOf(now.server) !== stampOf(m.server) && "server"].filter(
    (side): side is "file" | "server" => !!side,
  );
  if (changed.length) return { status: "stale", changed };

  // From the first step that changes anything, a failure is no longer "nothing was changed" (err.untouched says which it is).
  let acted = false;
  try {
    if (m.applyFile) {
      acted = true;
      await ops.applyFile((m.file as Side).text);
    }

    const copies: { id: string; from: Origin }[] = [];
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
        fileError = String((err as Error)?.message || err); // skipped: the chip says why, and the server push goes on
      }
    }

    acted = true;
    const pushed = ops.push ? await ops.push() : null;
    return { status: "done", copies, fileError, pushed };
  } catch (err) {
    (err as Error & { untouched?: boolean }).untouched = !acted;
    throw err;
  }
}

// What the dialog says when a side changed again since it was drawn: names the side, and asks to look again.
export function staleNote(m: ConflictModel, changed: ("file" | "server")[]) {
  const names = [changed.includes("file") && (m.name || "The file"), changed.includes("server") && "the server"].filter(
    (n): n is string => !!n,
  );
  const who = names.join(" and ").replace(/^the /, "The "); // a file name keeps its own case
  return `${who} changed again. Check the rows and choose again.`;
}
