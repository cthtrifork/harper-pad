// Sync all (docs/sync.md, "Sync all" and "Conflicts"): list what the server holds, decide for every draft what to do with `decide`, and do
// it. No Vue and no network or storage of its own: `device` and `fetchFn` for the server, `drafts` for the local store (the web store's
// get, save, allIds, changes, syncState, markSynced, applyRemote, applyRemoteDelete). Every decision is recomputed from stored state, so a
// run that stops halfway (offline, a phone suspended) is just a partial one and the next run carries on.
import { contentHash } from "./contentHash.js";
import { getDoc, listDocs, pushDraft, pushTombstone } from "./syncClient.js";
import { decide, settle } from "./syncPlan.js";

const pad = (n) => String(n).padStart(2, "0");

// The server's different version, kept here as a new draft: its first line gets "Conflicted copy <date time>: " in front.
export function conflictedCopy(content, now = new Date()) {
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  return `Conflicted copy ${stamp}: ${content}`;
}

// "3 uploaded, 2 downloaded, 1 conflicted copy" for a result of runSync.
export function summaryText(sum) {
  const parts = [
    [sum.uploaded, "uploaded"],
    [sum.downloaded, "downloaded"],
    [sum.conflicted, sum.conflicted === 1 ? "conflicted copy" : "conflicted copies"],
    [sum.removed, "removed"],
    [sum.failed, "could not be synced"],
    [sum.skipped, "open, left for next time"],
  ]
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n} ${what}`);
  return parts.length ? parts.join(", ") : "Everything is up to date";
}

const parseData = (doc) => {
  const blob = JSON.parse(doc.data);
  return { format: blob.format, content: blob.content };
};

// `skip` is a set of draft ids to leave alone this time (the one open in the editor, so a download cannot change text being typed).
// Resolves to {uploaded, downloaded, removed, conflicted, failed, skipped}. A server that cannot be reached, or that refuses this device,
// stops the run with a SyncError; any other failure counts one draft as `failed` and carries on.
export async function runSync({ device, drafts, fetchFn, skip = new Set(), now = () => new Date() }) {
  const server = new Map((await listDocs({ device, fetchFn })).map((d) => [d.id, d]));
  const { changed, deleted } = await drafts.changes();
  const localIds = new Set(await drafts.allIds());
  const changedSet = new Set(changed);
  const ids = [...new Set([...localIds, ...deleted, ...server.keys()])].sort();
  const sum = { uploaded: 0, downloaded: 0, removed: 0, conflicted: 0, failed: 0, skipped: 0 };

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

  async function one(id) {
    const st = await drafts.syncState(id);
    const srv = server.get(id) ?? null;
    const action = decide({
      local: localIds.has(id) ? { changed: changedSet.has(id) } : null,
      synced: st ? { updatedAt: st.updatedAt, deleted: st.deleted } : null,
      server: srv ? { updatedAt: srv.updatedAt, deleted: srv.deleted } : null,
    });
    if (action === "none") return;
    if (skip.has(id) && action !== "upload-tombstone") {
      sum.skipped++;
      return;
    }

    if (action === "upload") {
      if (await upload(await drafts.get(id), srv)) sum.uploaded++;
      else sum.failed++;
    } else if (action === "upload-tombstone") {
      const at = Date.now();
      const out = await pushTombstone({ device, id, state: srv, updatedAt: at, fetchFn });
      if (out.result !== "ok") return void sum.failed++;
      await drafts.markSynced(id, { hash: "", updatedAt: at, version: out.version, deleted: true });
      sum.uploaded++;
    } else if (action === "download") {
      const doc = await getDoc({ device, id, fetchFn });
      if (doc.deleted) return;
      await drafts.applyRemote({ id, ...parseData(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt }, doc.version);
      sum.downloaded++;
    } else if (action === "remove-local") {
      await drafts.applyRemoteDelete(id, srv.version, srv.updatedAt);
      sum.removed++;
    } else if (action === "resolve") {
      const doc = await getDoc({ device, id, fetchFn });
      const remote = parseData(doc);
      const mine = await drafts.get(id);
      const mineHash = await contentHash(mine.format, mine.content);
      if (settle(mineHash, await contentHash(remote.format, remote.content)) === "adopt") {
        await drafts.markSynced(id, { hash: mineHash, updatedAt: srv.updatedAt, version: srv.version, deleted: false });
        return;
      }
      // The server's text is kept as a new draft first, so nothing is lost if the next step fails; then this device's text goes on top.
      const copy = await drafts.save({ format: remote.format, content: conflictedCopy(remote.content, now()) });
      const topped = await upload(mine, srv);
      const copied = await upload(copy, null);
      if (topped && copied) sum.conflicted++;
      else sum.failed++;
    }
  }

  for (const id of ids) {
    try {
      await one(id);
    } catch (err) {
      if (err?.code === "unreachable" || err?.code === "signin") throw err;
      sum.failed++;
    }
  }
  return sum;
}
