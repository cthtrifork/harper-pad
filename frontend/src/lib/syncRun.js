// The one place a draft is synced (docs/sync.md, "Conflicts"): `all()` for Sync all, `one(id)` for the push after a save and `open(id)` for
// opening a note all decide with the same table, so a draft is uploaded, downloaded, removed or kept as a conflicted copy by this code only.
// `decide` and `settle` (syncPlan.js) are the pure table; nothing outside this file calls them or uploads a draft.
//
// No Vue and no network or storage of its own: `device` and `fetchFn` for the server, `drafts` for the local store (the web store's get, save,
// allIds, isChanged, changes, syncState, markSynced, applyRemote, applyRemoteDelete). Every decision is recomputed from stored state, so a
// run that stops halfway (offline, a phone suspended) is just a partial one and the next run carries on.
import { contentHash } from "./contentHash.js";
import { changesTo, cleanLists, readSettings, sameLists, unionLists } from "./settingsItems.js";
import { getDoc, getDocIfChanged, getSetting, listDocs, pushDraft, pushTombstone, putSetting } from "./syncClient.js";
import { decide, settle } from "./syncPlan.js";
import { SyncError } from "./syncEnroll.js";

const pad = (n) => String(n).padStart(2, "0");

// The server's different version, kept here as a new draft: its first line gets "Conflicted copy <date time>: " in front.
export function conflictedCopy(content, now = new Date()) {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `Conflicted copy ${stamp}: ${content}`;
}

const emptySum = () => ({ uploaded: 0, downloaded: 0, removed: 0, conflicted: 0, failed: 0, skipped: 0 });

// "3 uploaded, 2 downloaded, 1 conflicted copy" for a result of all().
export function summaryText(sum) {
  const parts = [
    [sum.uploaded, "uploaded"],
    [sum.downloaded, "downloaded"],
    [sum.conflicted, sum.conflicted === 1 ? "conflicted copy" : "conflicted copies"],
    [sum.removed, "removed"],
    [sum.failed, "failed"],
    [sum.skipped, "left open"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n} ${what}`);
  return parts.length ? parts.join(", ") : "Everything is up to date";
}

const parseData = (doc) => {
  const blob = JSON.parse(doc.data);
  return { format: blob.format, content: blob.content };
};
const stateOf = (doc) => (doc ? { version: doc.version, updatedAt: doc.updatedAt, deleted: !!doc.deleted } : null);

// A server that cannot be reached, or that refuses this device, stops everything with a SyncError; any other failure fails one draft.
// `onCopy(copy)` is called with the new draft when a conflict keeps the server's version as a conflicted copy, and `onGone(id)` when Sync all
// leaves a draft alone that was deleted on another device (it is the open one), so the person can be told.
export function createSyncer({
  device,
  drafts,
  fetchFn,
  now = () => new Date(),
  onCopy = () => {},
  onGone = () => {},
  onRejected = () => {},
}) {
  // Uploads a draft on top of `state` (the server's state, or null when it has none) and records the answer. True when it was taken.
  async function upload(draft, state) {
    const out = await pushDraft({ device, draft, state, fetchFn });
    if (out.result !== "ok") return false;
    await drafts.markSynced(draft.id, {
      hash: await contentHash(draft.format, draft.content),
      updatedAt: draft.updatedAt,
      version: out.version,
      deleted: false,
    });
    return true;
  }

  // Does what `decide` says for one draft. `local` is null or {changed}; `srv` is the server's state ({version, updatedAt, deleted}) or null.
  // Resolves to the name of the count it adds to ("uploaded", "downloaded", "removed", "conflicted", "failed", "skipped"), "" for nothing
  // to do, or "stale" when `guessed` is set and the server refused the upload because its state was not the one assumed.
  async function settleOne(id, local, srv, { skip = false, guessed = false } = {}) {
    const st = await drafts.syncState(id);
    const action = decide({
      local,
      synced: st ? { updatedAt: st.updatedAt, deleted: st.deleted } : null,
      server: srv ? { updatedAt: srv.updatedAt, deleted: srv.deleted } : null,
    });
    if (action === "none") return "";
    if (skip && action !== "upload-tombstone") {
      if (action === "remove-local") onGone(id);
      return "skipped";
    }

    if (action === "upload") {
      if (await upload(await drafts.get(id), srv)) return "uploaded";
      return guessed ? "stale" : "failed";
    }
    if (action === "upload-tombstone") {
      const at = Date.now();
      const out = await pushTombstone({ device, id, state: srv, updatedAt: at, fetchFn });
      if (out.result !== "ok") return guessed ? "stale" : "failed";
      await drafts.markSynced(id, { hash: "", updatedAt: at, version: out.version, deleted: true });
      return "uploaded";
    }
    if (action === "download") {
      const doc = await getDoc({ device, id, fetchFn });
      if (!doc || doc.deleted) return "";
      await drafts.applyRemote({ id, ...parseData(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt }, doc.version);
      return "downloaded";
    }
    if (action === "remove-local") {
      await drafts.applyRemoteDelete(id, srv.version, srv.updatedAt);
      return "removed";
    }
    // "resolve": changed on both sides. The same text and format is adopted; different text is a conflict, and nothing is replaced.
    const doc = await getDoc({ device, id, fetchFn });
    if (!doc) return "failed";
    const remote = parseData(doc);
    const mine = await drafts.get(id);
    const mineHash = await contentHash(mine.format, mine.content);
    if (settle(mineHash, await contentHash(remote.format, remote.content)) === "adopt") {
      await drafts.markSynced(id, { hash: mineHash, updatedAt: srv.updatedAt, version: srv.version, deleted: false });
      return "";
    }
    // The server's text is kept as a new draft first, so nothing is lost if the next step fails; then this device's text goes on top.
    const copy = await drafts.save({ format: remote.format, content: conflictedCopy(remote.content, now()) });
    onCopy(copy);
    const topped = await upload(mine, srv);
    const copied = await upload(copy, null);
    return topped && copied ? "conflicted" : "failed";
  }

  const api = {
    // Sync all: every draft, both ways. `skip` is a set of ids to leave alone this time (the draft open in the editor, so a download
    // cannot change text being typed). Resolves to {uploaded, downloaded, removed, conflicted, failed, skipped}.
    async all({ skip = new Set() } = {}) {
      const server = new Map((await listDocs({ device, fetchFn })).map((d) => [d.id, d]));
      const { changed, deleted } = await drafts.changes();
      const localIds = new Set(await drafts.allIds());
      const changedSet = new Set(changed);
      const sum = emptySum();
      for (const id of [...new Set([...localIds, ...deleted, ...server.keys()])].sort()) {
        try {
          const key = await settleOne(id, localIds.has(id) ? { changed: changedSet.has(id) } : null, server.get(id) ?? null, {
            skip: skip.has(id),
          });
          if (key) sum[key]++;
        } catch (err) {
          if (err?.code === "unreachable" || err?.code === "signin") throw err;
          if (err?.code === "rejected") onRejected(id, err.message); // the server refused this draft: it stays here and is tried again next time
          sum.failed++;
        }
      }
      return sum;
    },

    // Opening a note: the local text is already on screen; ask the server whether it holds something different (one conditional request,
    // a 304 when nothing changed) and settle by the same rules. Resolves to "updated" (the draft is unchanged here, `canSwap()` still says
    // nothing was typed, so the server's newer text was stored and the caller should show it), "newer" (the server has a different state
    // that was not applied: the draft was changed here, or was being typed in), "deleted" (the server holds a tombstone and nothing was
    // changed here; nothing is removed, `remove` and `keep` below carry out the person's choice) or "none" (a missing draft, or a tombstone
    // for a draft that was changed here, which survives).
    async open(id, { canSwap = () => true } = {}) {
      const [st, mine] = await Promise.all([drafts.syncState(id), drafts.get(id).catch(() => null)]);
      if (!mine) return "none";
      const local = { changed: await drafts.isChanged(id) };
      const got = await getDocIfChanged({ device, id, state: st, fetchFn });
      if (got.kind !== "doc") return "none";
      const srv = stateOf(got.doc);
      const action = decide({
        local,
        synced: st ? { updatedAt: st.updatedAt, deleted: st.deleted } : null,
        server: { updatedAt: srv.updatedAt, deleted: srv.deleted },
      });
      if (action === "resolve") return "newer";
      if (action === "remove-local") return "deleted"; // deleted on another device, and nothing was changed here: the person decides
      if (action !== "download") return "none";
      if (!canSwap()) return "newer";
      await drafts.applyRemote({ id, ...parseData(got.doc), createdAt: got.doc.createdAt, updatedAt: got.doc.updatedAt }, got.doc.version);
      return "updated";
    },

    // The push after a save: one draft, without listing the server. It assumes the server still holds what the last sync recorded, which
    // is nearly always true and costs one request; when the server refuses that, it reads the server's real state and settles the draft
    // by the same rules as Sync all (so a conflict made by a save is handled exactly like one found by Sync all). Resolves to the count
    // name, as settleOne does, never "stale".
    async one(id) {
      const [st, mine] = await Promise.all([drafts.syncState(id), drafts.get(id).catch(() => null)]);
      const local = mine ? { changed: await drafts.isChanged(id) } : null;
      const key = await settleOne(id, local, st ? { version: st.version, updatedAt: st.updatedAt, deleted: st.deleted } : null, {
        guessed: true,
      });
      if (key !== "stale") return key;
      return settleOne(id, local, stateOf(await getDoc({ device, id, fetchFn })));
    },

    // The person chose to keep a draft that was deleted on another device: the tombstone is taken as the known state, so the draft counts as
    // changed and is uploaded on top of it (an edit survives a delete), as any save would.
    async keep(id) {
      const got = await getDocIfChanged({ device, id, state: null, fetchFn });
      if (got.kind === "doc") {
        await drafts.markSynced(id, { hash: "", updatedAt: got.doc.updatedAt, version: got.doc.version, deleted: !!got.doc.deleted });
      }
      return api.one(id);
    },

    // The personal dictionary and the ignore list, docs/sync.md "Settings": `current()` gives {words, ignored} held now, `store` is the
    // sync record (settingsSync.js), `apply(changes)` makes the local lists match what was decided. The last device to sync wins, both
    // lists at a time, except that a device syncing for the first time deletes nothing:
    //   - the server has nothing: send this device's lists;
    //   - this device never synced them (just enrolled): the union of both is sent and applied, so no word on either side is lost;
    //   - changed here since the last sync: send them, over whatever the server holds (a write that lost a race is read and sent again);
    //   - not changed here: take the server's lists when its version moved.
    // The record is saved only after the lists were sent and applied, so a failure is retried and never mistaken for a local edit.
    async syncSettings({ current, store, apply }) {
      const rec = await store.load();
      const held = cleanLists(await current());
      const settle = async (version, target) => {
        const changes = changesTo(target, held);
        if (changes.any) await apply(changes);
        await store.save({ version, ...cleanLists(await current()) });
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await getSetting({ device, fetchFn });
        const send = async (lists) => {
          const out = await putSetting({ device, baseVersion: remote?.version ?? 0, ...lists, fetchFn });
          if (out.result !== "ok") return false;
          await settle(out.version, lists);
          return true;
        };
        if (!remote) {
          if (await send(held)) return;
          continue;
        }
        const theirs = readSettings(remote);
        if (!theirs) throw new SyncError("server", "The server's dictionary is not readable.");
        if (!rec) {
          const both = unionLists(held, theirs);
          if (sameLists(both, theirs)) await settle(remote.version, both);
          else if (!(await send(both))) continue;
          return;
        }
        const changedHere = !sameLists(held, rec);
        if (changedHere && !sameLists(held, theirs)) {
          if (await send(held)) return;
          continue;
        }
        if (!changedHere && rec.version !== remote.version) await settle(remote.version, theirs);
        else await store.save({ version: remote.version, ...cleanLists(await current()) });
        return;
      }
      throw new SyncError("server", "The settings changed on the server. Try again.");
    },

    // The person chose to remove it here too. Only if the server still holds the tombstone. Resolves to the draft that was removed (so the
    // caller can offer Undo), or null when nothing was removed.
    async removeLocal(id) {
      const mine = await drafts.get(id).catch(() => null);
      const doc = mine && (await getDoc({ device, id, fetchFn }));
      if (!mine || !doc?.deleted) return null;
      await drafts.applyRemoteDelete(id, doc.version, doc.updatedAt);
      return mine;
    },
  };
  return api;
}
