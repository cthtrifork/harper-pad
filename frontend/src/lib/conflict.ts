// The rules of the Keep or Overwrite dialog (docs/sync.md, "The Keep or Overwrite dialog"). Pure, so they are unit-tested;
// `useConflict.ts` wires them to the page.

import { whenStamp } from "./when.ts";

export const COPY_LABELS: Record<string, string> = {
  file: "Conflicted copy, from the file",
  server: "Conflicted copy, from the server",
  "file and server": "Conflicted copy, from the file and the server",
};

interface Side {
  text: string;
  stamp: string;
  at?: number;
}

export interface ConflictModel {
  id?: string;
  name?: string;
  yours?: string;
  draftAt?: number;
  /** null: that side has no conflict */
  file: Side | null;
  server: Side | null;
  /** The draft has no edits of its own and only the file changed: the file's text is "yours" and the draft takes it first. */
  applyFile?: boolean;
  sync?: boolean;
  protected?: boolean;
}

// What the words and the rows need of a model: no stamps.
interface View {
  name?: string;
  yours?: string;
  draftAt?: number;
  file?: Pick<Side, "text" | "at"> | null;
  server?: Pick<Side, "text" | "at"> | null;
  applyFile?: boolean;
  sync?: boolean;
}

interface Row {
  kind: "draft" | "file" | "server";
  label: string;
  when: string;
  tint: boolean;
}

export type Choice = "keep" | "overwrite";
export type Origin = "file" | "server" | "file and server";

const stampOf = (side: { stamp: string } | null | undefined) => (side ? side.stamp : null);

// One row per version, in the order draft, file, server. An unedited draft has no row of its own; the file's row is tinted instead,
// because its text counts as yours. `when` is "–" when the time is not known.
export function summaryRows(m: View, now = new Date()): Row[] {
  const when = (ms?: number) => (ms !== undefined && Number.isFinite(ms) && ms > 0 ? whenStamp(ms, now) : "–");
  return [
    !m.applyFile && { kind: "draft", label: "Your draft", when: when(m.draftAt), tint: true },
    m.file && { kind: "file", label: m.name || "The file", when: when(m.file.at), tint: !!m.applyFile },
    m.server && { kind: "server", label: "The server", when: when(m.server.at), tint: false },
  ].filter((row): row is Row => !!row);
}

const sameText = (m: View) => !!m.file && !!m.server && m.file.text === m.server.text;

// The words of the dialog: title, button labels and footer are what is seen; each button's sentence is its tooltip and what assistive
// technology reads.
export function describeConflict(m: View) {
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
    // With three versions the draft's own row is one of the "others".
    overwriteLabel: versions === 3 ? "Overwrite others" : fileOther ? "Overwrite file" : "Overwrite server",
    keepTitle: others ? `Keeps ${other} as ${copies}.` : "Nothing else differs, so no copy is made.",
    overwriteTitle: others ? `Deletes ${other}. No undo.` : "Nothing else differs, so nothing is deleted.",
    footer: m.applyFile
      ? `${m.name || "The file"} counts as yours: your draft has no edits. Overwrite cannot be undone.`
      : "Overwrite cannot be undone.",
  };
}

// What Keep saves as copies; a side whose text equals yours has none.
export function copiesFor(m: View): { text: string; from: Origin }[] {
  const file = m.file && !m.applyFile && m.file.text !== m.yours ? m.file : null;
  const server = m.server && m.server.text !== m.yours ? m.server : null;
  if (file && server && file.text === server.text) return [{ text: file.text, from: "file and server" }];
  const copies: { text: string; from: Origin }[] = [];
  if (file) copies.push({ text: file.text, from: "file" });
  if (server) copies.push({ text: server.text, from: "server" });
  return copies;
}

export interface ConflictOps {
  /** The current stamps of both sides, looked at now. */
  recheck(): Promise<{ file: { stamp: string } | null; server: { stamp: string } | null }>;
  /** Only when `applyFile`. */
  applyFile(text: string): Promise<unknown>;
  /** Saves a new unlinked draft and returns its id. */
  saveCopy(text: string, from: Origin): Promise<string>;
  /** Rejects with the reason; absent when the draft has no file. */
  writeFile?: (() => Promise<unknown>) | null;
  /** Absent when sync is off; false when it did not go. */
  push?: (() => Promise<boolean>) | null;
}

// Carries out the choice. Resolves to "stale" (nothing was written; the caller redraws) when either side moved since the dialog was drawn.

type Resolved =
  | { status: "stale"; changed: ("file" | "server")[] }
  | { status: "done"; copies: { id: string; from: Origin }[]; fileError: string; pushed: boolean | null };

export async function resolveConflict(choice: Choice, m: ConflictModel, ops: ConflictOps): Promise<Resolved> {
  const now = await ops.recheck();
  const changed = [stampOf(now.file) !== stampOf(m.file) && "file", stampOf(now.server) !== stampOf(m.server) && "server"].filter(
    (side): side is "file" | "server" => !!side,
  );
  if (changed.length) return { status: "stale", changed };

  // From the first step that changes anything, a failure is no longer "nothing was changed" (err.untouched).
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

// Names the side that changed again since the dialog was drawn.
export function staleNote(m: View, changed: ("file" | "server")[]) {
  const names = [changed.includes("file") && (m.name || "The file"), changed.includes("server") && "the server"].filter(
    (n): n is string => !!n,
  );
  const who = names.join(" and ").replace(/^the /, "The "); // a file name keeps its own case
  return `${who} changed again. Check the rows and choose again.`;
}
