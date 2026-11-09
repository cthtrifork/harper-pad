import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";
import { useConflict } from "./useConflict.ts";

const ID = "a".repeat(32);
const settle = () => new Promise((r) => setTimeout(r, 15));

// useDrafts and useSync reduced to what the dialog uses, recording what it does.
function setup({
  textStamp = "10",
  file = null,
  server = null,
  draftText = "mine",
  syncOn = true,
  serverNow = undefined,
  fileStampNow = undefined,
}) {
  const log = [];
  const fileConflict = ref(file ? { id: ID, name: "plan.md", stamp: "10", clean: false, ...file } : null);
  const serverConflict = ref(server ? { id: ID, text: "server text", stamp: "2:5", ...server } : null);
  let currentServer = serverNow;
  const drafts = {
    current: ref({ id: ID, filePath: "/home/me/plan.md" }),
    locked: ref(false),
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
      current: () => ({ id: ID, text: draftText }),
      plain: async (t) => t,
    },
  };
  const sync = {
    enrolled: ref(syncOn),
    serverConflict,
    checkNow: async () => log.push("checkNow"),
    inspectServer: async () =>
      currentServer === undefined ? (serverConflict.value ? { text: "server text", stamp: "2:5" } : null) : currentServer,
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
    log.filter((l) => l !== "checkNow"),
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
    log.filter((l) => l !== "checkNow" && l !== "clearFile" && l !== "clearServer"),
    ["applyFile", ["copy", "server text", "server"], "push"],
  );
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
  const second = setup({ file: {}, server: {}, serverNow: { text: "newer", stamp: "3:9" } });
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

test("a locked protected draft has no dialog until it is unlocked, and the server's version is compared as text", async () => {
  const { c, drafts, sync } = setup({ server: { text: "envelope-from-server" } });
  (drafts.dialog as { plain: (t: string) => Promise<string | null> }).plain = async (t) =>
    t === "envelope-from-server" ? "server text" : t;
  drafts.locked.value = true;
  await settle();
  assert.equal(c.model.value, null);
  drafts.locked.value = false;
  await settle();
  assert.equal(c.model.value?.server?.text, "server text");
  assert.ok(sync.serverConflict.value);
});

test("a version that cannot be opened with the key held is not shown as a conflict", async () => {
  const { c, drafts } = setup({ server: {} });
  (drafts.dialog as { plain: (t: string) => Promise<string | null> }).plain = async () => null;
  drafts.locked.value = true; // look again, as an unlock does
  await settle();
  drafts.locked.value = false;
  await settle();
  assert.equal(c.model.value, null);
});
