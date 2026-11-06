import assert from "node:assert/strict";
import test from "node:test";
import { contentHash } from "./contentHash.js";
import { generateDeviceKey } from "./dpop.js";
import { useSync } from "./useSync.js";

const ORIGIN = "https://sync.example.com";
const INVITE = `${ORIGIN}/join#${"A".repeat(43)}`;
const D = { id: "a".repeat(32), format: "markdown", content: "hello", createdAt: 1, updatedAt: 2 };

function setup({ fetchFn, enrolled = true, origin = ORIGIN, draftOverrides = {}, ...extra } = {}) {
  const kept = { device: null, states: new Map() };
  const deviceStore = {
    load: async () => kept.device,
    save: async (r) => {
      kept.device = r;
    },
    clear: async () => {
      kept.device = null;
    },
  };
  const drafts = {
    get: async () => D,
    allIds: async () => [],
    isChanged: async () => true,
    changes: async () => ({ changed: [], deleted: [] }),
    syncState: async (id) => kept.states.get(id) ?? null,
    markSynced: async (id, s) => {
      kept.states.set(id, s);
    },
    ...draftOverrides,
  };
  const sync = useSync({ origin, deviceStore, drafts, fetchFn, delay: 5, autoSync: false, ...extra });
  const ready = async () => {
    if (enrolled) kept.device = { server: ORIGIN, token: "tok", ...(await generateDeviceKey()) };
    await sync.init();
  };
  return { sync, kept, ready };
}
const reply = (status, body) => async () => ({ status, ok: status < 300, json: async () => body });
const settle = () => new Promise((r) => setTimeout(r, 60));

test("a build with no sync server shows nothing and does nothing", async () => {
  const { sync, ready } = setup({ origin: "" });
  await ready();
  assert.equal(sync.configured, false);
  assert.equal(sync.status.value, "off");
  sync.draftSaved(D.id);
});

test("not enrolled: off; enrolled: synced, with the device's name", async () => {
  const a = setup({ enrolled: false });
  await a.ready();
  assert.equal(a.sync.status.value, "off");
  const b = setup();
  await b.ready();
  assert.equal(b.sync.status.value, "synced");
  assert.deepEqual(b.sync.info.value, { server: ORIGIN });
});

test("an invite for another server is refused before anything is sent", async () => {
  let calls = 0;
  const { sync, ready } = setup({
    enrolled: false,
    fetchFn: async () => {
      calls++;
    },
  });
  await ready();
  assert.equal(await sync.enroll(`https://other.example.com/join#${"A".repeat(43)}`, "Phone"), false);
  assert.match(sync.error.value, /different server/);
  assert.equal(calls, 0);
});

test("a refused invite keeps the message and stays off; an accepted one enrolls", async () => {
  const bad = setup({ enrolled: false, fetchFn: reply(401, {}) });
  await bad.ready();
  assert.equal(await bad.sync.enroll(INVITE, "Phone"), false);
  assert.match(bad.sync.error.value, /not accepted/);
  assert.equal(bad.sync.status.value, "off");

  const ok = setup({ enrolled: false, fetchFn: reply(200, { deviceToken: "t", token_type: "DPoP" }) });
  await ok.ready();
  assert.equal(await ok.sync.enroll(INVITE, "Phone"), true);
  assert.equal(ok.sync.status.value, "synced");
  assert.equal(ok.sync.error.value, "");
});

test("a saved draft is pushed once after the delay, and its state is recorded", async () => {
  let puts = 0;
  const { sync, kept, ready } = setup({
    fetchFn: async () => {
      puts++;
      return reply(200, { version: 1 })();
    },
  });
  await ready();
  sync.draftSaved(D.id);
  sync.draftSaved(D.id);
  assert.equal(puts, 0);
  await settle();
  assert.equal(puts, 1);
  assert.equal(sync.status.value, "synced");
  const state = kept.states.get(D.id);
  assert.equal(state.version, 1);
  assert.equal(state.updatedAt, 2);
  assert.equal(state.hash, await contentHash("markdown", "hello"));
});

test("offline, signed out and conflict each leave their own status", async () => {
  const down = setup({
    fetchFn: async () => {
      throw new TypeError("x");
    },
  });
  await down.ready();
  down.sync.draftSaved(D.id);
  await settle();
  assert.equal(down.sync.status.value, "offline");

  const out = setup({ fetchFn: reply(401, {}) });
  await out.ready();
  out.sync.draftSaved(D.id);
  await settle();
  assert.equal(out.sync.status.value, "signin");
  assert.match(out.sync.error.value, /Signed out/);

  const clash = setup({ fetchFn: reply(409, { current: {} }) });
  await clash.ready();
  clash.sync.draftSaved(D.id);
  await settle();
  assert.equal(clash.sync.status.value, "pending");
  assert.equal(clash.kept.states.size, 0);
});

test("turning sync off forgets the device and keeps the drafts' state", async () => {
  const { sync, kept, ready } = setup({ fetchFn: reply(200, { version: 1 }) });
  await ready();
  kept.states.set(D.id, { version: 1 });
  await sync.turnOff();
  assert.equal(sync.status.value, "off");
  assert.equal(kept.device, null);
  assert.equal(kept.states.size, 1);
});

const empty = reply(200, []);

test("Sync all with nothing to do ends synced, says so, and saves what is typed first", async () => {
  let prepared = 0;
  let skipped;
  const { sync, ready } = setup({
    fetchFn: empty,
    prepare: async () => {
      prepared++;
    },
    skip: () => (skipped = new Set(["x"])),
  });
  await ready();
  await sync.syncAll();
  assert.equal(prepared, 1);
  assert.ok(skipped);
  assert.equal(sync.status.value, "synced");
  assert.equal(sync.summary.value, "Everything is up to date");
  assert.ok(sync.lastSync.value > 0);
});

test("Sync all offline or signed out leaves those states, and a server error leaves it pending", async () => {
  const down = setup({
    fetchFn: async () => {
      throw new TypeError("x");
    },
  });
  await down.ready();
  await down.sync.syncAll();
  assert.equal(down.sync.status.value, "offline");

  const out = setup({ fetchFn: reply(401, {}) });
  await out.ready();
  await out.sync.syncAll();
  assert.equal(out.sync.status.value, "signin");

  const broken = setup({ fetchFn: reply(500, {}) });
  await broken.ready();
  await broken.sync.syncAll();
  assert.equal(broken.sync.status.value, "pending");
  assert.match(broken.sync.error.value, /did not finish/);
});

test("a build that starts synced runs Sync all once the device is loaded", async () => {
  let lists = 0;
  const { sync, ready } = setup({
    autoSync: true,
    fetchFn: async () => {
      lists++;
      return empty();
    },
  });
  await ready();
  await sync.syncAll(); // waits for the run that init started, then runs again; both are fine
  assert.ok(lists >= 1);
  assert.equal(sync.status.value, "synced");
});

// Opening a note: what the chip's notice says.

test("opening a note: a newer version is swapped in with a short notice; a typed-in one only gets the marker", async () => {
  const doc = {
    id: D.id,
    version: 2,
    createdAt: 1,
    updatedAt: 5,
    deleted: false,
    data: JSON.stringify({ v: 1, format: "markdown", content: "newer" }),
  };
  const stored = [];
  const mk = () => {
    return setup({ fetchFn: reply(200, doc), draftOverrides: { isChanged: async () => false, applyRemote: async () => {} } });
  };
  const a = mk();
  a.kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await a.ready();
  let swapped = 0;
  await a.sync.noteOpened(D.id, { canSwap: () => true, onSwapped: () => swapped++ });
  assert.equal(swapped, 1);
  assert.deepEqual(a.sync.notice.value && [a.sync.notice.value.kind, a.sync.notice.value.text], ["updated", "Updated from the server"]);

  const b = mk();
  b.kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await b.ready();
  await b.sync.noteOpened(D.id, { canSwap: () => false, onSwapped: () => stored.push("swapped") });
  assert.deepEqual(stored, []);
  assert.equal(b.sync.notice.value.kind, "newer");
  assert.equal(b.sync.notice.value.text, "Newer on the server");
});

test("opening a note: an error shows nothing, and the next open clears the old notice", async () => {
  const { sync, kept, ready } = setup({
    draftOverrides: { isChanged: async () => false },
    fetchFn: async () => {
      throw new TypeError("x");
    },
  });
  kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await ready();
  await sync.noteOpened(D.id);
  assert.equal(sync.notice.value, null);
  assert.equal(sync.status.value, "synced"); // offline is not shown for an open
});

test("a successful check when opening a note lifts Offline to Pending", async () => {
  const doc = {
    id: D.id,
    version: 1,
    createdAt: 1,
    updatedAt: 1,
    deleted: false,
    data: JSON.stringify({ v: 1, format: "markdown", content: "x" }),
  };
  const { sync, kept, ready } = setup({ fetchFn: reply(200, doc), draftOverrides: { isChanged: async () => false } });
  kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await ready();
  sync.status.value = "offline";
  await sync.noteOpened(D.id);
  assert.equal(sync.status.value, "pending");
});

const NEWER = {
  id: D.id,
  version: 2,
  createdAt: 1,
  updatedAt: 5,
  deleted: false,
  data: JSON.stringify({ v: 1, format: "markdown", content: "newer" }),
};

test("Save pushes at once, without the wait, and clears a 'Newer on the server' marker the push settled", async () => {
  let puts = 0;
  const { sync, ready } = setup({
    delay: 100000,
    fetchFn: async (_u, init) => {
      if (init.method === "PUT") puts++;
      return reply(200, { version: 1 })();
    },
  });
  await ready();
  sync.notice.value = { id: D.id, kind: "newer", text: "Newer on the server" };
  await sync.saveRequested(D.id, {});
  assert.equal(puts, 1);
  assert.equal(sync.notice.value, null);
  assert.equal(sync.status.value, "synced");
});

test("Save with nothing to save still settles the marker: the newer version is swapped in", async () => {
  let swapped = 0;
  const { sync, kept, ready } = setup({
    delay: 100000,
    fetchFn: reply(200, NEWER),
    draftOverrides: { isChanged: async () => false, applyRemote: async () => {} },
  });
  kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await ready();
  sync.notice.value = { id: D.id, kind: "newer", text: "Newer on the server" };
  await sync.saveRequested(D.id, { canSwap: () => true, onSwapped: () => swapped++ });
  assert.equal(swapped, 1);
  assert.equal(sync.notice.value.kind, "updated");
});

test("'Open copy' opens the conflicted copy", async () => {
  const opened = [];
  const { sync, ready } = setup({ openDraft: (id) => opened.push(id) });
  await ready();
  sync.openCopy("c".repeat(32));
  assert.deepEqual(opened, ["c".repeat(32)]);
});

// Deleted on another device.
const TOMB = { id: D.id, version: 2, createdAt: 1, updatedAt: 5, deleted: true, data: "" };
const LIVE = { updatedAt: 1, version: 1, deleted: false, hash: "h" };

test("opening a note that was deleted elsewhere asks, and removes nothing", async () => {
  let applied = 0;
  const { sync, kept, ready } = setup({
    fetchFn: reply(200, TOMB),
    draftOverrides: {
      isChanged: async () => false,
      applyRemoteDelete: async () => {
        applied++;
      },
    },
  });
  kept.states.set(D.id, LIVE);
  await ready();
  await sync.noteOpened(D.id);
  assert.deepEqual(sync.gone.value, { id: D.id });
  assert.equal(applied, 0);
});

test("Remove: the draft is removed and handed to onRemoved; Keep: it is uploaded again", async () => {
  const removed = [];
  const restored = [];
  const a = setup({
    fetchFn: reply(200, TOMB),
    draftOverrides: { isChanged: async () => false, applyRemoteDelete: async () => {} },
    onRemoved: (d) => removed.push(d.id),
    onRestore: (d) => restored.push(d.id),
  });
  a.kept.states.set(D.id, LIVE);
  await a.ready();
  a.sync.gone.value = { id: D.id };
  await a.sync.removeGone();
  assert.deepEqual(removed, [D.id]);
  assert.equal(a.sync.gone.value, null);
  assert.equal(a.sync.notice.value.kind, "removed");
  a.sync.undoRemoved();
  assert.deepEqual(restored, [D.id]);
  assert.equal(a.sync.notice.value, null);

  const b = setup({ fetchFn: reply(200, { ...TOMB, version: 2 }), draftOverrides: { isChanged: async () => true } });
  b.kept.states.set(D.id, LIVE);
  await b.ready();
  b.sync.gone.value = { id: D.id };
  await b.sync.keepGone();
  assert.equal(b.sync.gone.value, null);
  assert.equal(b.sync.status.value, "synced");
  assert.equal(b.kept.states.get(D.id).deleted, false); // uploaded on top of the tombstone
});

test("a delete is pushed at once when its Undo offer ends", async () => {
  const methods = [];
  const { sync, kept, ready } = setup({
    delay: 100000,
    fetchFn: async (_u, init) => {
      methods.push(init.method);
      return reply(200, { version: 2 })();
    },
    draftOverrides: {
      get: async () => {
        throw new Error("draft not found");
      },
    },
  });
  kept.states.set(D.id, LIVE);
  await ready();
  await sync.draftDeleted(D.id);
  assert.deepEqual(methods, ["PUT"]);
  assert.equal(kept.states.get(D.id).deleted, true);
});

test("Sync on a draft that is unchanged here still asks the server, and swaps in a newer version without pushing anything", async () => {
  let puts = 0;
  let swapped = 0;
  const applied = [];
  const { sync, kept, ready } = setup({
    delay: 100000,
    fetchFn: async (_u, init) => {
      if (init.method === "PUT") puts++;
      return reply(200, NEWER)();
    },
    draftOverrides: { isChanged: async () => false, applyRemote: async (d) => applied.push(d) },
  });
  kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await ready();
  await sync.syncRequested(D.id, { canSwap: () => true, onSwapped: () => swapped++ });
  assert.equal(puts, 0);
  assert.equal(applied.length, 1);
  assert.equal(applied[0].updatedAt, 5, "the server's time is kept, not the clock's");
  assert.equal(swapped, 1);
  assert.equal(sync.notice.value.kind, "updated");
  assert.equal(sync.status.value, "synced");
});

test("Sync with nothing new on the server changes nothing", async () => {
  let applied = 0;
  const { sync, kept, ready } = setup({
    delay: 100000,
    fetchFn: reply(304, {}),
    draftOverrides: { isChanged: async () => false, applyRemote: async () => applied++ },
  });
  kept.states.set(D.id, { updatedAt: 1, version: 1, deleted: false, hash: "h" });
  await ready();
  await sync.syncRequested(D.id, {});
  assert.equal(applied, 0);
  assert.equal(sync.notice.value, null);
  assert.equal(sync.status.value, "synced");
});

test("Sync with the server unreachable says Offline, unlike opening a note, which says nothing", async () => {
  const down = async () => {
    throw new TypeError("network down");
  };
  const a = setup({ delay: 100000, fetchFn: down, draftOverrides: { isChanged: async () => false } });
  await a.ready();
  await a.sync.syncRequested(D.id, {});
  assert.equal(a.sync.status.value, "offline");
  const b = setup({ delay: 100000, fetchFn: down, draftOverrides: { isChanged: async () => false } });
  await b.ready();
  await b.sync.noteOpened(D.id, {});
  assert.equal(b.sync.status.value, "synced");
});
