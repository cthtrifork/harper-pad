import assert from "node:assert/strict";
import test from "node:test";
import { IDBFactory } from "fake-indexeddb";
import "fake-indexeddb/auto";
import { BACKUP_FORMAT, backupFileName, buildBackup, mergeSettings, parseBackup, planRestore, restoreMessage } from "./backup.js";
import { createWebDrafts, openDatabase } from "./webDrafts.js";

const id = (n) => n.toString(16).padStart(32, "0");
const draft = (n, over = {}) => ({
  id: id(n),
  format: "markdown",
  content: `# Note ${n}`,
  createdAt: 1000 + n,
  updatedAt: 2000 + n,
  ...over,
});

test("a backup round-trips through its text", () => {
  const backup = buildBackup({
    drafts: [{ ...draft(1), filePath: "x.md" }, draft(2)],
    settings: { words: ["harper"], ignored: '{"context_hashes":[1]}' },
    now: 5,
  });
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal("filePath" in backup.drafts[0], false);
  const read = parseBackup(JSON.stringify(backup));
  assert.deepEqual(read.drafts, [draft(1), draft(2)]);
  assert.deepEqual(read.settings.words, ["harper"]);
  assert.equal(read.skipped, 0);
});

test("the file name carries the date", () => {
  assert.equal(backupFileName(Date.UTC(2026, 10, 6, 12)), "harper-pad-backup-2026-11-06.json");
});

test("a file that is not a backup is refused with a message", () => {
  assert.throws(() => parseBackup("not json"), /not JSON/);
  assert.throws(() => parseBackup('{"hello":1}'), /not a Harper Pad backup/);
  assert.throws(() => parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 99, drafts: [] })), /newer version/);
});

test("drafts that are not valid are skipped and counted", () => {
  const bad = [draft(3, { id: "nope" }), draft(4, { format: "pdf" }), draft(5, { content: 7 }), draft(6, { updatedAt: 0 })];
  const read = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, drafts: [draft(1), ...bad] }));
  assert.equal(read.drafts.length, 1);
  assert.equal(read.skipped, 4);
});

test("restoring adds what is missing, replaces what is older and keeps what is as new", () => {
  const existing = new Map([
    [id(2), 2002], // as new: kept
    [id(3), 100], // older here: replaced
    [id(4), 9999], // newer here: kept
  ]);
  const plan = planRestore(existing, [draft(1), draft(2), draft(3), draft(4)]);
  assert.deepEqual(
    plan.add.map((d) => d.id),
    [id(1)],
  );
  assert.deepEqual(
    plan.replace.map((d) => d.id),
    [id(3)],
  );
  assert.equal(plan.kept, 2);
});

test("settings merge: words are joined, ignored findings are joined, labels keep this device's", () => {
  const merged = mergeSettings(
    { words: ["zed", "harper"], ignored: '{"context_hashes":[18446744073709551615,2]}', ignoredLabels: { 2: "mine" } },
    { words: ["alpha", "harper"], ignored: '{"context_hashes":[2,3]}', ignoredLabels: { 2: "theirs", 3: "three" } },
  );
  assert.deepEqual(merged.words, ["alpha", "harper", "zed"]);
  assert.equal(merged.ignored, '{"context_hashes":[18446744073709551615,2,3]}'); // 64-bit hashes stay exact
  assert.deepEqual(merged.ignoredLabels, { 2: "mine", 3: "three" });
});

test("settings merge with nothing on either side", () => {
  const merged = mergeSettings({ version: 1, words: [], ignored: "" }, { words: [], ignored: "", ignoredLabels: {} });
  assert.deepEqual(merged.words, []);
  assert.equal(merged.ignored, "");
});

test("the message says what happened", () => {
  assert.equal(restoreMessage({ added: 2, replaced: 1, kept: 0, skipped: 0 }), "Restored 3 drafts.");
  assert.equal(restoreMessage({ added: 1, replaced: 0, kept: 4, skipped: 2 }), "Restored 1 draft, 4 already up to date, 2 skipped.");
  assert.equal(restoreMessage({ added: 0, replaced: 0, kept: 3, skipped: 0 }), "Nothing new in the backup, 3 already up to date.");
});

test("restoring into the web store keeps the backup's times, the file link, and leaves sync state alone", async () => {
  globalThis.indexedDB = new IDBFactory();
  const drafts = createWebDrafts(openDatabase);
  const mine = await drafts.save({ content: "local" });
  await drafts.setFilePath(mine.id, "local.md");
  await drafts.restore([draft(1), { ...mine, content: "from backup", updatedAt: mine.updatedAt + 5 }]);
  const times = await drafts.updatedTimes();
  assert.equal(times.get(id(1)), 2001);
  const again = await drafts.get(mine.id);
  assert.equal(again.content, "from backup");
  assert.equal(again.updatedAt, mine.updatedAt + 5);
  assert.equal(again.filePath, "local.md");
  assert.equal((await drafts.list()).total, 2);
  assert.equal(await drafts.syncState(id(1)), null);
  assert.equal((await drafts.exportAll()).length, 2);
});

test("restoring refuses a draft that is not valid, before storing any", async () => {
  globalThis.indexedDB = new IDBFactory();
  const drafts = createWebDrafts(openDatabase);
  await assert.rejects(drafts.restore([draft(1), draft(2, { id: "x" })]), /not a draft id/);
  assert.equal((await drafts.list()).total, 0);
});
