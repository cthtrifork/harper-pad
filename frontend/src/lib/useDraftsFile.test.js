import assert from "node:assert/strict";
import test from "node:test";
import { ref } from "vue";
import { useDrafts } from "./useDrafts.js";

const ID = "a".repeat(32);
const open = { id: ID, format: "markdown", content: "old text\n", createdAt: 1, updatedAt: 2, filePath: "/home/me/plan.md" };
const FROM_FILE = { ...open, content: "from the file\n", updatedAt: 3 };

// A drafts composable over fake backend functions and a fake editor, enough for the linked-file paths.
function setup({ status, probe = null, extraApi = {} }) {
  const saved = [];
  const calls = [];
  const editor = ref({
    text: open.content,
    getText() {
      return this.text;
    },
    replaceText(t) {
      this.text = t;
      drafts.edited(); // the real editor reports an edit for every change
    },
    load() {},
    composing: () => false,
    undo() {},
  });
  const api = {
    linkedFileStatus: async () => status,
    linkedFileText: async () => ({ text: FROM_FILE.content, stamp: "7" }),
    reloadDraftFromFile: async (id) => {
      calls.push(["reload", id]);
      return FROM_FILE;
    },
    markFileDiffers: async (id) => calls.push(["mark", id]),
    saveDraft: async (d) => {
      calls.push(["saveDraft", d.content]);
      return { id: "c".repeat(32), format: d.format, content: d.content, createdAt: 1, updatedAt: 1, filePath: "" };
    },
    ...extraApi,
  };
  const drafts = useDrafts(
    editor,
    ref(false),
    { onSaved: (id, how) => saved.push([id, how]), onOpened: (id) => calls.push(["opened", id]), probeServer: probe },
    api,
  );
  return { drafts, editor, saved, calls };
}

const settle = () => new Promise((r) => setTimeout(r, 20));
const CLEAN = { state: "changed", clean: true, stamp: "1" };

test("an automatic refresh from the file pushes at once, like Ctrl+S (explicit), and shows the Updated toast", async () => {
  const { drafts, editor, saved, calls } = setup({ status: CLEAN });
  drafts.init({ open, total: 1 });
  await settle();
  assert.deepEqual(calls, [["reload", ID]]);
  assert.equal(editor.value.text, "from the file\n");
  assert.deepEqual(saved, [[ID, { explicit: true }]]);
  assert.equal(drafts.refreshed.value.name, "plan.md");
  assert.equal(drafts.fileConflict.value, null);
});

test("an edited draft whose file changed raises the conflict, takes nothing and pushes nothing", async () => {
  const { drafts, saved, calls } = setup({
    status: { state: "changed", clean: false, stamp: "1", fileLines: 1, draftLines: 1, onlyInFile: 1, onlyInDraft: 1 },
  });
  drafts.init({ open, total: 1 });
  await settle();
  assert.equal(drafts.fileConflict.value.name, "plan.md");
  assert.equal(drafts.fileConflict.value.clean, false);
  assert.deepEqual(calls, []);
  assert.deepEqual(saved, []);
});

test("before the refresh the server is asked: ahead with other text raises the dialog with the file as yours, and nothing is applied", async () => {
  const { drafts, saved, calls } = setup({ status: CLEAN, probe: async () => ({ ahead: true, text: "server text\n" }) });
  drafts.init({ open, total: 1 });
  await settle();
  assert.equal(drafts.fileConflict.value.clean, true);
  assert.equal(drafts.fileConflict.value.serverText, "server text\n");
  assert.deepEqual(calls, []);
  assert.deepEqual(saved, []);
});

test("the server ahead with the same text as the file: nothing more is done; unreachable or off: the file's text is applied and pushed", async () => {
  const same = setup({ status: CLEAN, probe: async () => ({ ahead: true, text: FROM_FILE.content }) });
  same.drafts.init({ open, total: 1 });
  await settle();
  assert.equal(same.drafts.fileConflict.value, null);
  assert.deepEqual(same.calls, []);

  for (const probe of [async () => null, async () => ({ ahead: false }), null]) {
    const { drafts, editor, saved } = setup({ status: CLEAN, probe });
    drafts.init({ open, total: 1 });
    await settle();
    assert.equal(editor.value.text, "from the file\n");
    assert.deepEqual(saved, [[ID, { explicit: true }]]);
  }
});

test("nothing is refreshed or pushed during an IME composition, and the next look does it", async () => {
  const { drafts, editor, saved, calls } = setup({ status: CLEAN });
  let composing = true;
  editor.value.composing = () => composing;
  drafts.init({ open, total: 1 });
  await settle();
  assert.deepEqual(calls, []);
  assert.deepEqual(saved, []);
  assert.equal(editor.value.text, "old text\n");
  composing = false;
  await drafts.checkFile(); // the window came back
  await settle();
  assert.deepEqual(calls, [["reload", ID]]);
  assert.deepEqual(saved, [[ID, { explicit: true }]]);
});

test("undoing the refresh is the person's decision: no mark on the file, the next Ctrl+S simply writes it", async () => {
  const { drafts, editor, calls } = setup({ status: CLEAN });
  drafts.init({ open, total: 1 });
  await settle();
  editor.value.text = open.content; // Ctrl+Z (the real editor reports the edit)
  drafts.edited();
  await settle();
  assert.equal(
    calls.some((c) => c[0] === "mark"),
    false,
  );
  assert.equal(drafts.fileState.value, "stale");
  assert.equal(drafts.refreshed.value, null);
});

test("a Conflicted copy is a new unlinked draft, labelled in memory only until it is edited, deleted or dismissed", async () => {
  const { drafts, calls, saved } = setup({ status: { state: "same" } });
  drafts.init({ open, total: 1 });
  await settle();
  const id = await drafts.dialog.saveCopy("the file's text", "file");
  assert.equal(id, "c".repeat(32));
  assert.deepEqual(calls.at(-1), ["saveDraft", "the file's text"]);
  assert.equal(drafts.copies.value[id], "file");
  assert.deepEqual(saved.at(-1), [id, undefined], "it syncs like any new draft, by the normal path");
  drafts.dropCopy(id);
  assert.equal(drafts.copies.value[id], undefined);
  // Editing the copy (it is the open draft) takes the label too.
  const second = await drafts.dialog.saveCopy("again", "server");
  assert.equal(drafts.copies.value[second], "server");
  drafts.dropCopy("nope"); // nothing to drop
});

test("the file's text and the file's version for the dialog come from the stored path through the backend", async () => {
  const { drafts } = setup({ status: { state: "changed", clean: false, stamp: "5" } });
  drafts.init({ open, total: 1 });
  await settle();
  assert.deepEqual(await drafts.dialog.fileText(), { text: "from the file\n", stamp: "7" });
  assert.equal(await drafts.dialog.fileStamp(), "5");
});

test("opening a draft: the file is looked at before sync is told, so a pull cannot change a clean draft first", async () => {
  let release;
  const other = { ...open, id: "d".repeat(32), filePath: "/home/me/other.md" };
  const { drafts, calls } = setup({
    status: { state: "same" },
    extraApi: {
      getDraft: async () => other,
      linkedFileStatus: () => new Promise((r) => (release = () => r({ state: "same" }))),
    },
  });
  const opening = drafts.open(other.id);
  await settle();
  assert.equal(
    calls.some((c) => c[0] === "opened"),
    false,
    "still looking at the file",
  );
  release();
  await opening;
  assert.deepEqual(
    calls.filter((c) => c[0] === "opened"),
    [["opened", other.id]],
  );
});

test("unlinking removes the link only, offers Undo with the file's name, and Undo puts the same link back", async () => {
  const unlinked = { ...open, filePath: "" };
  const { drafts, calls } = setup({
    status: { state: "same" },
    extraApi: {
      unlinkDraftFile: async (id) => {
        calls.push(["unlink", id]);
        return unlinked;
      },
      undoUnlinkDraftFile: async (id) => {
        calls.push(["undoUnlink", id]);
        return open;
      },
    },
  });
  drafts.init({ open, total: 1 });
  await settle();
  assert.equal(drafts.current.value.filePath, "/home/me/plan.md");
  await drafts.unlinkFile();
  assert.equal(drafts.current.value.filePath, "", "the chip is gone and Save as file is back");
  assert.equal(drafts.fileState.value, "none");
  assert.equal(drafts.unlinkedToast.value.name, "plan.md");
  assert.equal(drafts.current.value.id, ID, "the draft stays");
  await drafts.undoUnlink();
  assert.equal(drafts.current.value.filePath, "/home/me/plan.md");
  assert.equal(drafts.unlinkedToast.value, null);
  assert.deepEqual(
    calls.filter((c) => c[0].includes("nlink")),
    [
      ["unlink", ID],
      ["undoUnlink", ID],
    ],
  );
});

test("unlinking a struck chip clears the problem, and a failed Undo says so without touching the draft", async () => {
  const unlinked = { ...open, filePath: "" };
  const { drafts } = setup({
    status: { state: "missing" },
    extraApi: {
      unlinkDraftFile: async () => unlinked,
      undoUnlinkDraftFile: async () => {
        throw new Error("there is no link to restore");
      },
    },
  });
  drafts.init({ open, total: 1 });
  await settle();
  assert.equal(drafts.fileProblem.value, "file not found");
  await drafts.unlinkFile();
  assert.equal(drafts.fileProblem.value, "");
  await drafts.undoUnlink();
  assert.match(drafts.status.value || "", /./);
  assert.equal(drafts.current.value.filePath, "");
});
