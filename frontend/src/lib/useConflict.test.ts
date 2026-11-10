import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";
import { useConflict } from "./useConflict.ts";

const ID = "a".repeat(32);
const settle = () => new Promise((r) => setTimeout(r, 15));
type Inspection = { text: string; format?: string; stamp: string; updatedAt?: number } | null | false;

// useDrafts and useSync reduced to what the dialog uses, recording what it does.
function setup({
  textStamp = "10",
  file = null,
  server = null,
  draftText = "mine",
  syncOn = true,
  serverNow = undefined,
  serverInspectNow = serverNow,
  fileStampNow = undefined,
  flushDraft = undefined,
  needsSave = false,
  saveState = needsSave ? "error" : "saved",
}) {
  const log = [];
  const fileConflict = ref(file ? { id: ID, name: "plan.md", stamp: "10", clean: false, ...file } : null);
  const serverConflict = ref(server ? { id: ID, text: "server text", stamp: "2:5", ...server } : null);
  const needsSaveRef = ref(needsSave);
  const currentDraft = { id: ID, text: draftText, format: "markdown", updatedAt: 7, revision: 1 };
  let currentServer: Inspection | undefined;
  let inspected = 0;
  const drafts = {
    current: ref({ id: ID, filePath: "/home/me/plan.md" }),
    locked: ref(false),
    needsSave: needsSaveRef,
    state: ref(saveState),
    flush: async () => {
      log.push("flush");
      flushDraft?.(currentDraft, needsSaveRef);
    },
    fileConflict,
    clearFileConflict: () => {
      fileConflict.value = null;
      log.push("clearFile");
    },
    recheckFile: async () => log.push("recheckFile"),
    dialog: {
      fileText: async () => ({ text: "file text", stamp: textStamp }),
      fileStamp: async () => (fileStampNow === undefined ? "10" : fileStampNow),
      saveCopy: async (t, from) => {
        log.push(["copy", t, from]);
        return `copy-${from}`;
      },
      writeFile: async () => log.push("write"),
      applyFile: async () => log.push("applyFile"),
      current: () => ({ ...currentDraft }),
    },
  };
  const sync = {
    enrolled: ref(syncOn),
    serverConflict,
    checkNow: async () => log.push("checkNow"),
    inspectServer: async () => {
      if (currentServer !== undefined) return currentServer;
      const configured = inspected++ === 0 ? serverInspectNow : serverNow;
      if (configured !== undefined)
        return configured && typeof configured === "object" ? { format: "markdown", ...configured } : configured;
      return serverConflict.value
        ? {
            text: serverConflict.value.text,
            format: serverConflict.value.format ?? "markdown",
            stamp: serverConflict.value.stamp,
            updatedAt: serverConflict.value.updatedAt ?? 5,
          }
        : null;
    },
    forcePush: async () => {
      log.push("push");
      return true;
    },
    clearConflict: () => {
      serverConflict.value = null;
      log.push("clearServer");
    },
  };
  return {
    c: useConflict({ drafts, sync } as unknown as Parameters<typeof useConflict>[0]),
    log,
    drafts,
    sync,
    setServer: (v) => (currentServer = v),
    currentDraft,
    needsSaveRef,
  };
}

test("a conflict with the file alone is one dialog for the file, after the server was looked at too", async () => {
  const { c, log } = setup({ file: {} });
  await settle();
  assert.ok(log.includes("checkNow"));
  assert.equal(c.model.value.file.text, "file text");
  assert.equal(c.model.value.server, null);
  assert.equal(c.model.value.yours, "mine");
  assert.equal(c.model.value.applyFile, false);
});

test("a draft that conflicts with both gets one dialog covering both, and Keep saves both copies first, then writes, then pushes", async () => {
  const { c, log } = setup({ file: {}, server: {} });
  await settle();
  assert.equal(c.model.value.file.text, "file text");
  assert.equal(c.model.value.server.text, "server text");
  await c.choose("keep");
  assert.deepEqual(
    log.filter((l) => l !== "checkNow" && l !== "flush"),
    [["copy", "file text", "file"], ["copy", "server text", "server"], "write", "push", "clearFile", "clearServer"],
  );
  assert.equal(c.model.value, null);
  assert.deepEqual(c.result.value.copies, [
    { id: "copy-file", from: "file" },
    { id: "copy-server", from: "server" },
  ]);
});

test("an unedited draft: the file's text is yours; Keep copies only the server's, applies the file, pushes, and writes nothing", async () => {
  const { c, log } = setup({ file: { clean: true }, server: {} });
  await settle();
  assert.equal(c.model.value.applyFile, true);
  assert.equal(c.model.value.yours, "file text");
  await c.choose("keep");
  assert.deepEqual(
    log.filter((l) => l !== "checkNow" && l !== "clearFile" && l !== "clearServer" && l !== "flush"),
    ["applyFile", ["copy", "server text", "server"], "push"],
  );
});

test("a saved draft whose linked file still needs writing can resolve its conflict", async () => {
  const { c, log } = setup({ file: {}, needsSave: true, saveState: "saved" });
  await settle();
  await c.choose("keep");
  assert.equal(c.note.value, "");
  assert.ok(log.includes("write"));
  assert.ok(log.includes("push"));
  assert.equal(c.model.value, null);
});

test("if either side moved since the dialog was drawn it is redrawn and nothing is written", async () => {
  const { c, log } = setup({ file: {}, server: {}, fileStampNow: "11" });
  await settle();
  await c.choose("keep");
  assert.ok(log.includes("recheckFile"));
  assert.equal(
    log.some((l) => l === "write" || l === "push" || (Array.isArray(l) && l[0] === "copy")),
    false,
  );
  assert.equal(c.note.value, "plan.md changed again. Check the rows and choose again.");
  assert.ok(c.model.value, "the dialog stays");
  const second = setup({
    file: {},
    server: {},
    serverNow: { text: "newer", stamp: "3:9" },
    serverInspectNow: { text: "server text", stamp: "2:5", updatedAt: 5 },
  });
  await settle();
  await second.c.choose("overwrite");
  assert.equal(second.log.includes("write"), false);
});

test("no conflict, no dialog; and a draft that is not the open one gets none", async () => {
  const { c } = setup({});
  await settle();
  assert.equal(c.model.value, null);
  const other = setup({ file: { id: "b".repeat(32) } });
  await settle();
  assert.equal(other.c.model.value, null);
});

test("an unedited draft whose server holds nothing or the file's own text shows no dialog after all", async () => {
  const none = setup({ file: { clean: true }, serverNow: null });
  await settle();
  assert.equal(none.c.model.value, null);
  const same = setup({ file: { clean: true }, server: { text: "file text" } });
  await settle();
  assert.equal(same.c.model.value, null);
  const differs = setup({ file: { clean: true }, server: { text: "other" } });
  await settle();
  assert.ok(differs.c.model.value, "a different server text still asks");
});

test("the file's version stamp (its modified time in nanoseconds) becomes a time in milliseconds, with no zone shift", async () => {
  const { c } = setup({ textStamp: "1793995200123456789", fileStampNow: "1793995200123456789", file: { stamp: "1793995200123456789" } });
  await settle();
  assert.equal(c.model.value.file.at, 1793995200123);
  assert.equal(new Date(c.model.value.file.at).toISOString(), "2026-11-06T20:00:00.123Z");
});

const ENVELOPE = 'hp-protected:1:{"s":"AA","n":"AA","c":"AA"}';
const protectedServer = { text: ENVELOPE, stamp: "2:5", updatedAt: 5 };

test("protected envelopes use the shared dialog after unlocking", async () => {
  const { c, drafts } = setup({ draftText: ENVELOPE, server: protectedServer, serverNow: protectedServer });
  await settle();
  assert.equal(c.model.value?.protected, true);
  assert.equal(c.model.value?.server?.text, ENVELOPE);
  assert.equal(c.model.value?.yours, ENVELOPE);
  drafts.locked.value = true;
  await settle();
  assert.equal(c.model.value, null, "Keep needs the key to seal the copy under its new id");
  drafts.locked.value = false;
  await settle();
  assert.equal(c.model.value?.server?.text, ENVELOPE);
});

test("Overwrite server sends this device's protected version and copies nothing", async () => {
  const { c, log, sync } = setup({ server: protectedServer, serverNow: protectedServer });
  await settle();
  await c.choose("overwrite");
  assert.ok(log.includes("push"));
  assert.equal(
    log.some((l) => Array.isArray(l) && l[0] === "copy"),
    false,
  );
  assert.equal(c.model.value, null);
  assert.equal(sync.serverConflict.value, null);
});

test("Keep both copies the protected server envelope before pushing this device's version", async () => {
  const { c, log, drafts } = setup({ server: protectedServer, serverNow: protectedServer });
  drafts.current.value.filePath = "";
  await settle();
  await c.choose("keep");
  assert.deepEqual(log, ["flush", ["copy", ENVELOPE, "server"], "push", "clearFile", "clearServer"]);
  assert.equal(c.model.value, null);
});

test("if the server moved since a protected dialog was drawn, it is redrawn and nothing is written", async () => {
  const { c, log, setServer } = setup({ server: protectedServer, serverNow: protectedServer });
  await settle();
  setServer({ text: ENVELOPE, stamp: "3:9", updatedAt: 9 });
  await c.choose("overwrite");
  assert.equal(log.includes("push"), false);
  assert.match(c.note.value, /changed again/);
  assert.equal(c.model.value?.server?.stamp, "3:9");
});

test("a conflict choice does nothing when the draft locked meanwhile", async () => {
  const { c, drafts, log } = setup({
    server: protectedServer,
    serverNow: protectedServer,
    flushDraft: () => {
      drafts.locked.value = true;
    },
  });
  await settle();
  await c.choose("keep");
  assert.deepEqual(log, ["flush"]);
  assert.match(c.note.value, /changed meanwhile/);
  assert.equal(c.model.value, null, "the unlock button is available again");
});

test("protected choices flush first and redraw if the saved draft changed since the dialog opened", async () => {
  const { c, log, currentDraft } = setup({
    server: protectedServer,
    serverNow: protectedServer,
    flushDraft: (draft) => {
      draft.updatedAt = 8;
      draft.revision++;
    },
  });
  await settle();
  await c.choose("keep");
  assert.ok(log.includes("flush"));
  assert.equal(
    log.some((entry) => Array.isArray(entry) && entry[0] === "copy"),
    false,
  );
  assert.match(c.note.value, /changed meanwhile/);
  assert.equal(c.model.value?.draftAt, currentDraft.updatedAt);
});

test("protected choices stop when autosaving fails", async () => {
  const { c, log } = setup({ server: protectedServer, serverNow: protectedServer, needsSave: true });
  await settle();
  await c.choose("overwrite");
  assert.ok(log.includes("flush"));
  assert.equal(log.includes("push"), false);
  assert.match(c.note.value, /could not be saved/);
  assert.ok(c.model.value);
});
