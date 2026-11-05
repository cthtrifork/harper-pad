// Conflict handling exists in one place: createSyncer in syncRun.js. This keeps it so: the decision table (syncPlan.js), the calls that
// upload and download drafts (syncClient.js) and the store's apply-remote and sync-state methods are used by syncRun.js and by nothing
// else, so a second path that settles drafts differently cannot appear without this test failing and saying why.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const SRC = fileURLToPath(new URL("..", import.meta.url));

function sources(dir = SRC) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.(js|vue)$/.test(e.name) && !/\.test\.js$/.test(e.name) ? [p] : [];
  });
}
const rel = (p) => path.relative(SRC, p);
const files = sources().map((p) => ({ name: rel(p), text: readFileSync(p, "utf8") }));
const importers = (module) => files.filter((f) => new RegExp(`from\\s+["'][^"']*${module}["']`).test(f.text)).map((f) => f.name);

test("only syncRun.js imports the decision table", () => {
  assert.deepEqual(importers("syncPlan\\.js"), ["lib/syncRun.js"]);
});

test("only syncRun.js uploads or downloads drafts", () => {
  const users = files
    .filter((f) => /\b(pushDraft|pushTombstone|getDoc|listDocs)\b/.test(f.text.replace(/\/\/.*$/gm, "")))
    .map((f) => f.name)
    .sort();
  assert.deepEqual(users, ["lib/syncClient.js", "lib/syncRun.js"]);
});

test("only syncRun.js calls the store's sync methods", () => {
  const calls = files
    .filter((f) => /\.(markSynced|applyRemote|applyRemoteDelete|syncState|isChanged|changes)\(/.test(f.text.replace(/\/\/.*$/gm, "")))
    .map((f) => f.name)
    .sort();
  assert.deepEqual(calls, ["lib/syncRun.js"]);
});

test("the two ways in, Sync all and the push after a save, both come from createSyncer", () => {
  const users = files.filter((f) => /createSyncer\(/.test(f.text.replace(/\/\/.*$/gm, ""))).map((f) => f.name);
  assert.deepEqual(users.sort(), ["lib/syncRun.js", "lib/useSync.js"]);
  const useSync = files.find((f) => f.name === "lib/useSync.js").text;
  assert.match(useSync, /syncer\.one\(/);
  assert.match(useSync, /\.all\(/);
});
