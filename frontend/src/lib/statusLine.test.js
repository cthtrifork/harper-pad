import assert from "node:assert/strict";
import { test } from "node:test";
import { statusLine } from "./statusLine.js";

const saved = { state: "saved", text: "Saved", fileState: "none", fileName: "" };
const on = (status, extra = {}) => ({ enrolled: true, status, newer: false, ...extra });

test("without sync the draft's own text is shown unchanged", () => {
  assert.deepEqual(statusLine({ draft: saved, sync: { enrolled: false, status: "off" } }), { text: "Saved", tone: "mute" });
  assert.deepEqual(statusLine({ draft: { ...saved, text: "Saved to a.md" }, sync: null }), { text: "Saved to a.md", tone: "mute" });
});

test("a draft that is being typed or saved says so, with sync on or not", () => {
  assert.equal(statusLine({ draft: { ...saved, state: "dirty" }, sync: on("synced") }).text, "Unsaved changes");
  assert.equal(statusLine({ draft: { ...saved, state: "saving" }, sync: on("synced") }).text, "Saving...");
});

test("a failed local save is an error and is never turned into a sync message", () => {
  const out = statusLine({ draft: { ...saved, state: "error", text: "Not saved: disk full" }, sync: on("offline") });
  assert.deepEqual(out, { text: "Not saved: disk full", tone: "bad" });
});

test("with sync on, the state of the server is part of the line", () => {
  assert.equal(statusLine({ draft: saved, sync: on("synced") }).text, "Saved and synced");
  assert.equal(statusLine({ draft: saved, sync: on("syncing") }).text, "Syncing...");
  assert.equal(statusLine({ draft: saved, sync: on("pending") }).text, "Saved, not synced yet");
  assert.equal(statusLine({ draft: saved, sync: on("offline") }).text, "Saved, offline");
  assert.deepEqual(statusLine({ draft: saved, sync: on("signin") }), { text: "Saved, sign in again", tone: "bad" });
});

test("a newer version on the server wins over a quiet state", () => {
  assert.deepEqual(statusLine({ draft: saved, sync: on("synced", { newer: true }) }), { text: "Newer on the server", tone: "accent" });
});

test("a linked file adds its hint once the draft is synced", () => {
  const linked = (fileState) => ({ ...saved, fileState, fileName: "notes.md" });
  assert.equal(statusLine({ draft: linked("synced"), sync: on("synced") }).text, "Synced, written to notes.md");
  assert.equal(statusLine({ draft: linked("stale"), sync: on("synced") }).text, "Synced, notes.md not updated");
  assert.equal(statusLine({ draft: linked("unknown"), sync: on("synced") }).text, "Saved and synced");
});

test("a draft the server refuses says which and why", () => {
  const refused = statusLine({ draft: saved, sync: on("pending", { rejected: { title: "Plan", reason: "it is too large" } }) });
  assert.deepEqual(refused, { text: "Could not sync Plan: it is too large", tone: "bad" });
});
