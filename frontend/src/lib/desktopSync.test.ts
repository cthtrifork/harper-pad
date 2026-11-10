import assert from "node:assert/strict";
import test from "node:test";
import "fake-indexeddb/auto";
import { createDesktopSyncDrafts, SYNC_STORE_METHODS } from "./desktopSync.ts";
import { createWebDrafts, openDatabase } from "./webDrafts.ts";

import type { Draft } from "../../bindings/github.com/cthtrifork/harper-pad/internal/store";

type BindingsFn = Parameters<typeof createDesktopSyncDrafts>[0];

// A stand-in for the generated bindings that records every call. A service must not answer `then`, or await would wait on it as a promise.
function fakeBindings() {
  const calls = [];
  const record = (service) =>
    new Proxy(
      {},
      {
        get(_target, method) {
          if (method === "then") return undefined;
          return async (...args) => {
            calls.push([service, method, ...args]);
            return `${service}.${String(method)}`;
          };
        },
      },
    );
  const bindings = async () => ({ DraftService: record("DraftService"), SyncService: record("SyncService") });
  return { calls, bindings: bindings as unknown as BindingsFn };
}

test("the desktop store has the same operations as the web store", () => {
  const web = createWebDrafts(openDatabase);
  const desktop = createDesktopSyncDrafts((async () => ({})) as unknown as BindingsFn);
  for (const name of SYNC_STORE_METHODS) {
    assert.equal(typeof web[name], "function", `web.${name}`);
    assert.equal(typeof desktop[name], "function", `desktop.${name}`);
  }
  assert.deepEqual(Object.keys(desktop).sort(), [...SYNC_STORE_METHODS].sort(), "the desktop store has nothing the engine does not use");
});

test("each operation goes to the Go method that does the same thing", async () => {
  const { calls, bindings } = fakeBindings();
  const d = createDesktopSyncDrafts(bindings);
  const draft = { id: "a".repeat(32), content: "x" } as unknown as Draft;
  const sent = { ...draft, protected: false, title: "x", excerpt: "", tasks: [], tasksTotal: 0, tasksDone: 0 }; // Go stores the summary the page makes
  await d.get("a");
  await d.save(draft);
  await d.allIds();
  await d.isChanged("b");
  await d.changes();
  await d.syncState("c");
  await d.applyRemote(draft, 4);
  await d.applyRemoteDelete("e", 5, 6);
  assert.deepEqual(calls, [
    ["DraftService", "GetDraft", "a"],
    ["DraftService", "SaveDraft", sent],
    ["SyncService", "AllDraftIDs"],
    ["SyncService", "DraftChanged", "b"],
    ["SyncService", "DraftChanges"],
    ["SyncService", "DraftSyncState", "c"],
    ["SyncService", "ApplyRemote", sent, 4],
    ["SyncService", "ApplyRemoteDelete", "e", 5, 6],
  ]);
});

test("markSynced sends the four fields as the Go type has them, with the defaults the web store applies", async () => {
  const { calls, bindings } = fakeBindings();
  const d = createDesktopSyncDrafts(bindings);
  await d.markSynced("a", { hash: "h", updatedAt: 2, version: 3 });
  await d.markSynced("b", { updatedAt: 5, deleted: true, version: 6 });
  assert.deepEqual(calls, [
    ["SyncService", "MarkSynced", "a", { hash: "h", updatedAt: 2, deleted: false, version: 3 }],
    ["SyncService", "MarkSynced", "b", { hash: "", updatedAt: 5, deleted: true, version: 6 }],
  ]);
});

test("a rejection from Go reaches the engine, which treats a missing draft as null", async () => {
  const d = createDesktopSyncDrafts((async () => ({
    DraftService: {
      GetDraft: async () => {
        throw new Error("draft not found");
      },
    },
  })) as unknown as BindingsFn);
  assert.equal(await d.get("x").catch(() => null), null);
});
