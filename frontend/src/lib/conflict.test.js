import assert from "node:assert/strict";
import test from "node:test";
import { copiesFor, describeConflict, resolveConflict } from "./conflict.js";

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
    assert.deepEqual(r, { status: "stale" });
    assert.deepEqual(o.log, []);
  }
});

test("the words name the file, the versions that differ, and whose text each choice loses", () => {
  const file = describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: null });
  assert.equal(file.title, "plan.md changed on disk");
  assert.match(file.keep, /Keep: your draft's text goes to plan\.md\. The text now in plan\.md is saved first as a Conflicted copy/);
  assert.match(file.overwrite, /Overwrite: .* The text now in plan\.md is lost for good, with no undo/);
  const synced = describeConflict({ name: "plan.md", sync: true, yours: "a", file: side("b"), server: null });
  assert.match(synced.keep, /goes to plan\.md and the server\./);
  const both = describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: side("c") });
  assert.match(both.title, /plan\.md and the server both differ/);
  assert.match(both.keep, /two Conflicted copies/);
  assert.match(describeConflict({ name: "plan.md", yours: "a", file: side("b"), server: side("b") }).keep, /one Conflicted copy/);
  const server = describeConflict({ name: "", yours: "a", file: null, server: side("c") });
  assert.equal(server.title, "This draft changed on another device");
  assert.match(server.overwrite, /The server's text is lost for good/);
  const clean = describeConflict({ name: "plan.md", yours: "b", applyFile: true, file: side("b"), server: side("c") });
  assert.match(clean.detail, /no edits of its own, so plan\.md's text counts as yours/);
  assert.match(clean.keep, /plan\.md's text goes to the server\. The server's text is saved first/);
});
