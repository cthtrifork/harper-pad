import assert from "node:assert/strict";
import test from "node:test";
import { createFileChange, shortReason } from "./fileChange.js";

const draft = { id: "a".repeat(32), filePath: "/home/me/notes/plan.md" };
const changed = { state: "changed", stamp: "1" };
const clean = { ...changed, clean: true };
const answers = (s) => async () => s;

test("a changed file with an edited draft is a conflict, with the file's name, and no chip problem", async () => {
  const fc = createFileChange(answers(changed));
  await fc.check(draft);
  assert.equal(fc.conflict.value.name, "plan.md");
  assert.equal(fc.conflict.value.stamp, "1");
  assert.equal(fc.conflict.value.clean, false);
  assert.equal(fc.problem.value, null);
});

test("a file that is gone or cannot be used (binary and too large included) is only a chip problem, never a conflict, and it clears when usable", async () => {
  let s = { state: "missing" };
  const fc = createFileChange(async () => s);
  await fc.check(draft);
  assert.equal(fc.conflict.value, null);
  assert.deepEqual(fc.problem.value, { id: draft.id, reason: "file not found" });
  s = { state: "broken", reason: "it is now a folder" };
  await fc.check(draft);
  assert.equal(fc.problem.value.reason, "now a folder");
  s = { state: "broken", reason: "it is not text (binary or not UTF-8)" };
  await fc.check(draft);
  assert.equal(fc.problem.value.reason, "not text (binary or not UTF-8)");
  s = { state: "same" };
  await fc.check(draft);
  assert.equal(fc.problem.value, null);
  // A save that found a changed file it cannot read at all is a chip problem too.
  s = { state: "broken", reason: "permission denied" };
  await fc.raise(draft);
  assert.equal(fc.conflict.value, null);
  assert.equal(fc.problem.value.reason, "permission denied");
  // A failed write marks the link, a successful one (clear) restores it.
  fc.failed(draft, "Not saved to a file: /home/me/plan.md was not overwritten: it is not text (binary or not UTF-8)");
  assert.equal(fc.problem.value.reason, "not text (binary or not UTF-8)");
  fc.clear();
  assert.equal(fc.problem.value, null);
});

test("unchanged, unlinked and failing checks raise nothing", async () => {
  let asked = 0;
  const fc = createFileChange(async () => {
    asked++;
    return { state: "same" };
  });
  await fc.check(draft);
  await fc.check({ id: draft.id, filePath: "" });
  await fc.check(null);
  assert.equal(fc.conflict.value, null);
  assert.equal(asked, 1, "only a linked draft is looked at");
  const broken = createFileChange(async () => {
    throw new Error("no database");
  });
  await broken.check(draft);
  assert.equal(broken.conflict.value, null);
  await createFileChange(answers({ state: "none" })).check(draft);
});

test("opening another draft clears the dialog, and a late answer for the old one is ignored", async () => {
  let release;
  const fc = createFileChange((id) =>
    id === draft.id ? new Promise((r) => (release = () => r(changed))) : Promise.resolve({ state: "none" }),
  );
  const slow = fc.check(draft);
  await fc.check({ id: "b".repeat(32), filePath: "" });
  release();
  await slow;
  assert.equal(fc.conflict.value, null);
});

test("the conflict stays until it is answered: a look at the same version keeps it, a changed file replaces it, a settled file clears it", async () => {
  let s = changed;
  const fc = createFileChange(async () => s);
  await fc.check(draft);
  const first = fc.conflict.value.tick;
  await fc.check(draft); // focus again
  assert.equal(fc.conflict.value.tick, first, "the same version is not redrawn");
  s = { ...changed, stamp: "2" };
  await fc.check(draft);
  assert.equal(fc.conflict.value.stamp, "2");
  s = { state: "same" };
  await fc.check(draft);
  assert.equal(fc.conflict.value, null);
  await fc.raise(draft); // a save found it
});

test("raise falls back to a plain conflict when the details are not available (the web build)", async () => {
  const web = createFileChange(answers({ state: "none" }));
  await web.raise(draft);
  const broken = createFileChange(async () => {
    throw new Error("x");
  });
  await broken.raise(draft);
  assert.ok(broken.conflict.value);
  await broken.raise({ id: draft.id, filePath: "" });
  broken.clear();
  assert.equal(broken.conflict.value, null);
});

test("a clean draft is refreshed quietly with no conflict, and waits for a quiet moment", async () => {
  const ran = [];
  let ok = false;
  const fc = createFileChange(answers(clean), { can: () => ok, run: async (d, name) => ran.push([d.id, name]) });
  await fc.check(draft);
  assert.deepEqual(ran, []);
  assert.equal(fc.conflict.value, null);
  ok = true;
  await fc.check(draft);
  assert.deepEqual(ran, [[draft.id, "plan.md"]]);
});

test("an edited draft, a save that found the file, and a failed look do not take the file's text", async () => {
  let runs = 0;
  const auto = { can: () => true, run: async () => runs++ };
  const edited = createFileChange(answers(changed), auto);
  await edited.check(draft);
  assert.ok(edited.conflict.value);
  const forced = createFileChange(answers(clean), auto);
  await forced.check(draft, { force: true });
  assert.equal(forced.conflict.value.clean, true, "a clean draft stays clean when looked at again");
  assert.equal(runs, 0);
  const plain = createFileChange(answers(clean)); // no quiet path
  await plain.check(draft);
  assert.ok(plain.conflict.value);
});

test("a clean draft whose server also holds other text raises the dialog with the file as yours", () => {
  const fc = createFileChange(answers({ state: "same" }));
  fc.raiseClean(draft, { stamp: "9", serverText: "from the server" });
  assert.equal(fc.conflict.value.clean, true);
  assert.equal(fc.conflict.value.serverText, "from the server");
  fc.clearConflict();
  assert.equal(fc.conflict.value, null);
});

test("short reasons drop the path and the wrapping", () => {
  assert.equal(shortReason("could not write /a/b.md: permission denied"), "permission denied");
  assert.equal(shortReason("could not write /a/b.md: it is not a regular file"), "not a regular file");
  assert.equal(shortReason("Permission denied."), "permission denied");
  assert.equal(shortReason(""), "file not usable");
});
