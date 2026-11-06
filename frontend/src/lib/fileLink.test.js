import assert from "node:assert/strict";
import test from "node:test";
import { dirtyText, fileControls, saveAsAction, UNLINK_FIRST } from "./fileLink.js";

const linked = { filePath: "/home/me/plan.md", fileProblem: "", canUnlink: true };

test("no link: Save as file, no x", () => {
  assert.deepEqual(fileControls({ ...linked, filePath: "" }), { showSaveAs: true, showChipX: false, showDirty: false });
  assert.equal(saveAsAction({ ...linked, filePath: "" }), "ask");
});

test("linked and healthy: the chip's unlink button only, and Ctrl+Shift+S only hints", () => {
  assert.deepEqual(fileControls(linked), { showSaveAs: false, showChipX: true, showDirty: false });
  assert.equal(saveAsAction(linked), "hint");
  assert.equal(UNLINK_FIRST, "Unlink first to save as another file");
});

test("linked with the chip struck through: the unlink button and Save as file beside it", () => {
  const struck = { ...linked, fileProblem: "file not found" };
  assert.deepEqual(fileControls(struck), { showSaveAs: true, showChipX: true, showDirty: false });
  assert.equal(saveAsAction(struck), "ask");
});

test("the web build is unchanged: Save as file is always there and there is no x", () => {
  const web = { filePath: "plan.md", fileProblem: "", canUnlink: false };
  assert.deepEqual(fileControls(web), { showSaveAs: true, showChipX: false, showDirty: false });
  assert.equal(saveAsAction(web), "ask");
});

test("the dirty dot shows only for a healthy linked draft that is newer than its file", () => {
  const dot = (o) => fileControls({ ...linked, ...o }).showDirty;
  assert.equal(dot({ fileState: "stale" }), true);
  for (const fileState of ["synced", "unknown", "none", undefined]) assert.equal(dot({ fileState }), false, String(fileState));
  assert.equal(dot({ fileState: "stale", fileProblem: "file not found" }), false, "the struck chip wins");
  assert.equal(dot({ fileState: "stale", filePath: "" }), false, "no link");
  assert.equal(dot({ fileState: "stale", canUnlink: false }), false, "not on the web");
  assert.equal(dirtyText("plan.md"), "Your draft has changes not yet in plan.md. Ctrl+S updates it.");
});
