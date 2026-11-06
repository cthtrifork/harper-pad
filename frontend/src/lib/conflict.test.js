import assert from "node:assert/strict";
import test from "node:test";
import { copiesFor, describeConflict, resolveConflict, staleNote, summaryRows } from "./conflict.js";

const side = (text, stamp = "1") => ({ text, stamp });

// Fake operations that record what happened in order, and report the sides as they were drawn unless told otherwise.
function ops(m, extra = {}) {
  const log = [];
  let copyN = 0;
  return {
    log,
    recheck: async () => ({ file: m.file && { stamp: m.file.stamp }, server: m.server && { stamp: m.server.stamp } }),
    applyFile: async (t) => log.push(["applyFile", t]),
    saveCopy: async (t, from) => {
      log.push(["copy", t, from]);
      return `copy${++copyN}`;
    },
    writeFile: async () => log.push(["write"]),
    push: async () => {
      log.push(["push"]);
      return true;
    },
    ...extra,
  };
}

test("Overwrite writes the file first, then pushes, and makes no copy", async () => {
  const m = { yours: "mine", file: side("theirs"), server: side("srv") };
  const o = ops(m);
  const r = await resolveConflict("overwrite", m, o);
  assert.deepEqual(o.log, [["write"], ["push"]]);
  assert.deepEqual(r, { status: "done", copies: [], fileError: "", pushed: true });
});

test("Keep with both sides different saves two copies first, then writes and pushes", async () => {
  const m = { yours: "mine", file: side("from file"), server: side("from server") };
  const o = ops(m);
  const r = await resolveConflict("keep", m, o);
  assert.deepEqual(o.log, [["copy", "from file", "file"], ["copy", "from server", "server"], ["write"], ["push"]]);
  assert.deepEqual(
    r.copies.map((c) => c.from),
    ["file", "server"],
  );
});

test("Keep with the same text on the file and the server saves one copy", async () => {
  const m = { yours: "mine", file: side("same"), server: side("same") };
  const o = ops(m);
  const r = await resolveConflict("keep", m, o);
  assert.deepEqual(
    o.log.filter((l) => l[0] === "copy"),
    [["copy", "same", "file and server"]],
  );
  assert.equal(r.copies.length, 1);
});

test("a side that equals yours or has no conflict gets no copy", () => {
  assert.deepEqual(copiesFor({ yours: "x", file: side("x"), server: side("y") }), [{ text: "y", from: "server" }]);
  assert.deepEqual(copiesFor({ yours: "x", file: side("y"), server: null }), [{ text: "y", from: "file" }]);
  assert.deepEqual(copiesFor({ yours: "x", file: null, server: null }), []);
});

test("an unedited draft: the file's text counts as yours, so Keep copies only the server's text and nothing is written to the file", async () => {
  const m = { yours: "file text", applyFile: true, file: side("file text"), server: side("server text") };
  const o = ops(m);
  const r = await resolveConflict("keep", m, o);
  assert.deepEqual(o.log, [["applyFile", "file text"], ["copy", "server text", "server"], ["push"]]);
  assert.equal(r.copies.length, 1);
  const overwrite = ops(m);
  await resolveConflict("overwrite", m, overwrite);
  assert.deepEqual(overwrite.log, [["applyFile", "file text"], ["push"]]);
});

test("a failed file write is skipped, reported, and the server push goes on", async () => {
  const m = { yours: "mine", file: side("theirs"), server: side("srv") };
  const o = ops(m, {
    writeFile: async () => {
      throw new Error("permission denied");
    },
  });
  const r = await resolveConflict("overwrite", m, o);
  assert.equal(r.fileError, "permission denied");
  assert.deepEqual(o.log, [["push"]]);
  assert.equal(r.status, "done");
});

test("a server that cannot be reached leaves the push pending, the file is still written", async () => {
  const m = { yours: "mine", file: side("theirs"), server: null };
  const o = ops(m, { push: async () => false });
  const r = await resolveConflict("keep", m, o);
  assert.equal(r.pushed, false);
  assert.deepEqual(o.log, [["copy", "theirs", "file"], ["write"]]);
  const off = ops(m, { push: null });
  assert.equal((await resolveConflict("overwrite", m, off)).pushed, null);
});

test("a file-only conflict with sync off writes the file and has no push", async () => {
  const m = { yours: "mine", file: side("theirs"), server: null };
  const o = ops(m, { push: null });
  const r = await resolveConflict("overwrite", m, o);
  assert.deepEqual(o.log, [["write"]]);
  assert.equal(r.status, "done");
});

test("when either side moved since the dialog was drawn nothing is written and the caller redraws", async () => {
  const m = { yours: "mine", file: side("theirs", "1"), server: side("srv", "7") };
  for (const moved of [
    { file: { stamp: "2" }, server: { stamp: "7" } },
    { file: { stamp: "1" }, server: { stamp: "8" } },
    { file: { stamp: "1" }, server: null },
  ]) {
    const o = ops(m, { recheck: async () => moved });
    const r = await resolveConflict("keep", m, o);
    assert.equal(r.status, "stale");
    assert.ok(r.changed.length >= 1);
    assert.deepEqual(o.log, []);
  }
});

const at = (h, m, d = 6) => new Date(2026, 10, d, h, m).getTime();
const NOW = new Date(2026, 10, 6, 23, 59);

test("the rows are the versions that exist, in the order draft, file, server, each with only a timestamp", () => {
  const rows = summaryRows(
    { name: "plan.md", yours: "a", draftAt: at(14, 7), file: { text: "x", at: at(14, 5) }, server: { text: "y", at: at(13, 58, 5) } },
    NOW,
  );
  assert.deepEqual(rows, [
    { kind: "draft", label: "Your draft", when: "14:07", tint: true },
    { kind: "file", label: "plan.md", when: "14:05", tint: false },
    { kind: "server", label: "The server", when: "5 Nov, 13:58", tint: false },
  ]);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["kind", "label", "tint", "when"], "no line counts");
});

test("only the rows that exist; an unedited draft has no row of its own and the file's row is tinted; an unknown time is a dash", () => {
  assert.deepEqual(
    summaryRows({ name: "plan.md", yours: "x", file: { text: "y" } }, NOW).map((r) => [r.kind, r.when]),
    [
      ["draft", "–"],
      ["file", "–"],
    ],
  );
  const unedited = summaryRows(
    { name: "plan.md", yours: "b", applyFile: true, file: { text: "b", at: NaN }, server: { text: "c", at: 0 } },
    NOW,
  );
  assert.deepEqual(unedited, [
    { kind: "file", label: "plan.md", when: "–", tint: true },
    { kind: "server", label: "The server", when: "–", tint: false },
  ]);
  assert.deepEqual(
    summaryRows({ name: "", yours: "q", server: { text: "r" } }, NOW).map((r) => r.label),
    ["Your draft", "The server"],
  );
  const three = summaryRows({ yours: "q", file: { text: "a" }, server: { text: "b" } }, NOW);
  assert.equal(three.length, 3, "never more than three");
  assert.equal(three[1].label, "The file", "a missing name still gives a label");
});

test("the title and the buttons name what differs: three versions, file only, server only, unedited", () => {
  const side = (text) => ({ text });
  const three = describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: side("c") });
  assert.deepEqual([three.title, three.keepLabel, three.overwriteLabel], ["Three versions differ", "Keep all", "Overwrite others"]);
  const file = describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: null });
  assert.deepEqual([file.title, file.keepLabel, file.overwriteLabel], ["plan.md changed on disk", "Keep both", "Overwrite"]);
  const server = describeConflict({ name: "", yours: "a", file: null, server: side("c") });
  assert.deepEqual(
    [server.title, server.keepLabel, server.overwriteLabel],
    ["This draft changed on another device", "Keep both", "Overwrite"],
  );
  const unedited = describeConflict({ name: "plan.md", yours: "b", applyFile: true, file: side("b"), server: side("c") });
  assert.deepEqual([unedited.title, unedited.keepLabel, unedited.overwriteLabel], ["Two versions differ", "Keep both", "Overwrite"]);
  assert.equal(three.versions, 3);
  assert.equal(file.versions, 2);
});

test("the footer is one short line, the same in every case, except for an unedited draft", () => {
  const side = (text) => ({ text });
  for (const m of [
    { name: "plan.md", yours: "a", file: side("b"), server: side("c") },
    { name: "plan.md", yours: "a", file: side("b"), server: null },
    { name: "", yours: "a", file: null, server: side("c"), sync: true },
    { name: "plan.md", yours: "a", file: side("b"), sync: false },
  ]) {
    assert.equal(describeConflict(m).footer, "Overwrite cannot be undone.");
  }
  assert.equal(
    describeConflict({ name: "plan.md", yours: "b", applyFile: true, file: side("b"), server: side("c") }).footer,
    "plan.md counts as yours: your draft has no edits. Overwrite cannot be undone.",
  );
});

test("the full sentences stay for the tooltips: what each choice updates and deletes", () => {
  const side = (text) => ({ text });
  const three = describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: side("c"), sync: true });
  assert.equal(
    three.keepTitle,
    "Keeps the text now in plan.md and the server's text as two Conflicted copies, then updates plan.md and the server with your draft.",
  );
  assert.equal(
    three.overwriteTitle,
    "Deletes the other versions (the text now in plan.md and the server's text). No undo. Updates plan.md and the server with your draft.",
  );
  const same = describeConflict({ name: "plan.md", yours: "a", file: side("s"), server: side("s") });
  assert.match(same.keepTitle, /as a Conflicted copy, then/, "one copy when the file and the server hold the same text");
  assert.match(same.overwriteTitle, /^Deletes the other version \(/);
  const fileOnly = describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: null, sync: false });
  assert.equal(fileOnly.keepTitle, "Keeps the text now in plan.md as a Conflicted copy, then updates plan.md with your draft.");
  const serverOnly = describeConflict({ name: "", yours: "a", file: null, server: side("c") });
  assert.equal(serverOnly.overwriteTitle, "Deletes the other version (the server's text). No undo. Updates the server with your draft.");
});

test("an unedited draft with nothing else differing is described without crashing", () => {
  const d = describeConflict({ name: "plan.md", yours: "b", applyFile: true, sync: true, file: { text: "b" }, server: null });
  assert.equal(d.keepTitle, "Nothing else differs, so no copy is made. Updates the server with plan.md's text.");
  assert.equal(d.overwriteTitle, "Nothing else differs, so nothing is deleted. Updates the server with plan.md's text.");
  assert.match(
    describeConflict({ name: "plan.md", yours: "b", applyFile: true, sync: false, file: { text: "b" }, server: null }).keepTitle,
    /Updates where it belongs with/,
  );
});

test("the notes: which side changed again, and nothing-changed only when it is true", async () => {
  assert.equal(staleNote({ name: "plan.md" }, ["file"]), "plan.md changed again. Check the rows and choose again.");
  assert.equal(staleNote({ name: "plan.md" }, ["server"]), "The server changed again. Check the rows and choose again.");
  assert.equal(
    staleNote({ name: "plan.md" }, ["file", "server"]),
    "plan.md and the server changed again. Check the rows and choose again.",
  );
  const m = { yours: "mine", file: { text: "theirs", stamp: "1" }, server: null };
  const base = {
    recheck: async () => ({ file: { stamp: "1" }, server: null }),
    saveCopy: async () => "c1",
    writeFile: async () => {},
    push: async () => true,
  };
  await assert.rejects(
    resolveConflict("keep", m, {
      ...base,
      saveCopy: async () => {
        throw new Error("disk full");
      },
    }),
    (e) => e.untouched === false,
  ); // the first copy was being made
  await assert.rejects(
    resolveConflict("overwrite", m, {
      ...base,
      recheck: async () => {
        throw new Error("offline");
      },
    }),
    (e) => e.untouched === undefined,
  );
  await assert.rejects(
    resolveConflict("overwrite", m, {
      ...base,
      push: async () => {
        throw new Error("boom");
      },
    }),
    (e) => e.untouched === false,
  );
});
