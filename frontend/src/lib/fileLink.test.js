import assert from "node:assert/strict";
import test from "node:test";
import { fileControls, saveAsAction, UNLINK_FIRST } from "./fileLink.js";

const linked = { filePath: "/home/me/plan.md", fileProblem: "", canUnlink: true };

test("no link: Save as file, no x", () => {
  assert.deepEqual(fileControls({ ...linked, filePath: "" }), { showSaveAs: true, showChipX: false });
  assert.equal(saveAsAction({ ...linked, filePath: "" }), "ask");
});

test("linked and healthy: the chip's x only, and Ctrl+Shift+S only hints", () => {
  assert.deepEqual(fileControls(linked), { showSaveAs: false, showChipX: true });
  assert.equal(saveAsAction(linked), "hint");
  assert.equal(UNLINK_FIRST, "Unlink first to save as another file");
});

test("linked with the chip struck through: the x and Save as file beside it", () => {
  const struck = { ...linked, fileProblem: "file not found" };
  assert.deepEqual(fileControls(struck), { showSaveAs: true, showChipX: true });
  assert.equal(saveAsAction(struck), "ask");
});

test("the web build is unchanged: Save as file is always there and there is no x", () => {
  const web = { filePath: "plan.md", fileProblem: "", canUnlink: false };
  assert.deepEqual(fileControls(web), { showSaveAs: true, showChipX: false });
  assert.equal(saveAsAction(web), "ask");
});
