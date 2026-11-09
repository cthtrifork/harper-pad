// The one place a draft is synced (docs/sync.md, "Conflicts"): `all()`, `one(id)` and `open(id)` decide with the same table, so a draft is
// uploaded, downloaded or removed by this code only. `device` and `fetchFn` are the server, `drafts` the local store. Every decision is
// recomputed from stored state, so a run that stops halfway (offline, a phone suspended) is just a partial one.
import { contentHash } from "./contentHash.ts";
import { isProtected } from "./protect.ts";
import { changesTo, cleanLists, readSettings, sameLists, unionLists } from "./settingsItems.ts";
import type { SettingsSyncRecord } from "./settingsSync.ts";
import { type Doc, getDoc, getDocIfChanged, getSetting, listDocs, pushDraft, pushTombstone, putSetting } from "./syncClient.ts";
import type { DeviceRecord } from "./syncDevice.ts";
import { SyncError } from "./syncEnroll.ts";
import { decide, settle } from "./syncPlan.ts";

type SyncState = import("../../bindings/github.com/cthtrifork/harper-pad/internal/store").SyncState;

export interface LocalDraft {
  id: string;
  format: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

// The web store's operations of the same names (webDrafts.ts, desktopSync.ts).
export interface SyncStore {
  get(id: string): Promise<LocalDraft>;
  allIds(): Promise<string[]>;
  isChanged(id: string): Promise<boolean>;
  changes(): Promise<{ changed: string[]; deleted: string[] }>;
  syncState(id: string): Promise<SyncState | null>;
  markSynced(id: string, state: Partial<SyncState> & Pick<SyncState, "updatedAt" | "version">): Promise<unknown>;
  applyRemote(draft: LocalDraft, version: number): Promise<unknown>;
  applyRemoteDelete(id: string, version: number, updatedAt: number): Promise<unknown>;
}

type Count = "uploaded" | "downloaded" | "removed" | "failed" | "skipped";
type Sum = Record<Count, number>;
// What the server holds for a draft.
interface ServerState {
  version: number;
  updatedAt: number;
  deleted: boolean;
}

const emptySum = (): Sum => ({ uploaded: 0, downloaded: 0, removed: 0, failed: 0, skipped: 0 });

// "3 uploaded, 2 downloaded, 1 removed" for a result of all().
export function summaryText(sum: Sum) {
  const parts = (
    [
      [sum.uploaded, "uploaded"],
      [sum.downloaded, "downloaded"],
      [sum.removed, "removed"],
      [sum.failed, "failed"],
      [sum.skipped, "left open"],
    ] as [number, string][]
  )
    .filter(([n]) => n > 0)
    .map(([n, what]) => `${n} ${what}`);
  return parts.length ? parts.join(", ") : "Everything is up to date";
}

const parseData = (doc: Doc) => {
  const blob = JSON.parse(doc.data);
  return { format: blob.format, content: blob.content };
};
const stateOf = (doc: Doc | null): ServerState | null =>
  doc ? { version: doc.version, updatedAt: doc.updatedAt, deleted: !!doc.deleted } : null;

// An unreachable server, or one that refuses this device, stops everything with a SyncError; any other failure fails one draft. A draft
// changed on both sides with different text is a conflict only the person can settle (Keep or Overwrite): nothing here replaces, copies
// or uploads it, `all()` leaves it alone until it is open, and `one()` and `open()` answer "conflict" for it. `onGone(id)` is called when
// Sync all leaves alone a draft that was deleted on another device (the open one), so the person can be told.
export function createSyncer({
  device,
  drafts,
  fetchFn,
  onGone = () => {},
  onRejected = () => {},
  onStripped = () => {},
}: {
  device: DeviceRecord;
  drafts: SyncStore;
  fetchFn?: typeof fetch;
  onGone?: (id: string) => void;
  onRejected?: (id: string, message: string) => void;
  onStripped?: (id: string) => void;
}) {
  // Records the answer. True when the server took it.
  async function upload(draft: LocalDraft, state: ServerState | null) {
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

  // Protection is never removed, so a plain version of a protected draft can only be the server (or an old build) stripping it. It is not
  // applied: this device's protected version, the source of truth, goes back on top of it. `onStripped(id)` tells the person.
  async function stripped(id: string, doc: Doc) {
    const mine = await drafts.get(id).catch(() => null);
    if (!mine || !isProtected(mine.content) || isProtected(parseData(doc).content)) return false;
    if (!(await upload(mine, stateOf(doc)))) throw new SyncError("server", "Could not restore the protected draft.");
    onStripped(id);
    return true;
  }

  // Does what `decide` says. Resolves to the count it adds to, "conflict", "" for nothing to do, or "stale" when `guessed` is set and the
  // server refused the upload because its state was not the one assumed.
  async function settleOne(
    id: string,
    local: { changed: boolean } | null,
    srv: ServerState | null,
    { skip = false, guessed = false } = {},
  ): Promise<Count | "conflict" | "stale" | ""> {
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
      if (await stripped(id, doc)) return "";
      await drafts.applyRemote({ id, ...parseData(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt }, doc.version);
      return "downloaded";
    }
    if (action === "remove-local") {
      await drafts.applyRemoteDelete(id, (srv as ServerState).version, (srv as ServerState).updatedAt);
      return "removed";
    }
    // "resolve": the same text and format is adopted; different text is a conflict, and nothing is replaced.
    const doc = await getDoc({ device, id, fetchFn });
    if (!doc) return "failed";
    const remote = parseData(doc);
    const mine = await drafts.get(id);
    const mineHash = await contentHash(mine.format, mine.content);
    if (settle(mineHash, await contentHash(remote.format, remote.content)) === "adopt") {
      await drafts.markSynced(id, {
        hash: mineHash,
        updatedAt: (srv as ServerState).updatedAt,
        version: (srv as ServerState).version,
        deleted: false,
      });
      return "";
    }
    return "conflict"; // left exactly as it is: the person decides when the draft is open
  }

  const api = {
    // Every draft, both ways. `skip` holds ids to leave alone this time (the open draft, so a download cannot change text being typed).
    async all({ skip = new Set<string>() } = {}) {
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
          if (key && key in sum) sum[key as Count]++; // "conflict" is not counted: it waits for the person
        } catch (err) {
          const code = (err as SyncError)?.code;
          if (code === "unreachable" || code === "signin") throw err;
          if (code === "rejected") onRejected(id, (err as SyncError).message); // it stays here and is tried again next time
          sum.failed++;
        }
      }
      return sum;
    },

    // The local text is already on screen: one conditional request asks whether the server holds something different. "updated": the
    // server's newer text was stored (nothing was typed, per `canSwap()`), so show it. "newer": it was not applied because the draft was
    // changed here or is being typed in. "deleted": a tombstone, nothing removed (`removeLocal` and `keep` carry out the choice).
    // "none": nothing to do, or a tombstone for a draft changed here, which survives.
    async open(
      id: string,
      { canSwap = () => true }: { canSwap?: () => boolean } = {},
    ): Promise<"updated" | "newer" | "deleted" | "conflict" | "none"> {
      const [st, mine] = await Promise.all([drafts.syncState(id), drafts.get(id).catch(() => null)]);
      if (!mine) return "none";
      const local = { changed: await drafts.isChanged(id) };
      const got = await getDocIfChanged({ device, id, state: st, fetchFn });
      if (got.kind !== "doc") return "none";
      const srv = stateOf(got.doc) as ServerState;
      const action = decide({
        local,
        synced: st ? { updatedAt: st.updatedAt, deleted: st.deleted } : null,
        server: { updatedAt: srv.updatedAt, deleted: srv.deleted },
      });
      if (action === "resolve") {
        const remote = parseData(got.doc);
        const mineHash = await contentHash(mine.format, mine.content);
        if (settle(mineHash, await contentHash(remote.format, remote.content)) === "adopt") {
          await drafts.markSynced(id, { hash: mineHash, updatedAt: srv.updatedAt, version: srv.version, deleted: false });
          return "none";
        }
        return "conflict";
      }
      if (action === "remove-local") return "deleted"; // deleted on another device, and nothing was changed here: the person decides
      if (action !== "download") return "none";
      if (!canSwap()) return "newer";
      if (await stripped(id, got.doc)) return "none";
      await drafts.applyRemote({ id, ...parseData(got.doc), createdAt: got.doc.createdAt, updatedAt: got.doc.updatedAt }, got.doc.version);
      return "updated";
    },

    // The push after a save, without listing the server. It assumes the server still holds what the last sync recorded (one request); when
    // refused, it reads the real state and settles by the same rules as Sync all. Never "stale".
    async one(id: string) {
      const [st, mine] = await Promise.all([drafts.syncState(id), drafts.get(id).catch(() => null)]);
      const local = mine ? { changed: await drafts.isChanged(id) } : null;
      const key = await settleOne(id, local, st ? { version: st.version, updatedAt: st.updatedAt, deleted: st.deleted } : null, {
        guessed: true,
      });
      if (key !== "stale") return key;
      return settleOne(id, local, stateOf(await getDoc({ device, id, fetchFn })));
    },

    // For the conflict dialog. The stamp is the server's state; the dialog compares it again when the person chooses, and redraws if it moved.
    async inspect(id: string) {
      const doc = await getDoc({ device, id, fetchFn });
      if (!doc) return null;
      const remote = doc.deleted ? { format: "markdown", content: "" } : parseData(doc);
      return {
        text: remote.content,
        format: remote.format,
        stamp: `${doc.version}:${doc.updatedAt}`,
        updatedAt: doc.updatedAt,
        deleted: !!doc.deleted,
      };
    },

    // Before an automatic refresh from a file: has the server something this device has not seen? One conditional request.
    async probe(id: string): Promise<{ ahead: false } | { ahead: true; text: string }> {
      const st = await drafts.syncState(id);
      const got = await getDocIfChanged({ device, id, state: st, fetchFn });
      if (got.kind !== "doc" || got.doc.deleted) return { ahead: false };
      return { ahead: true, text: parseData(got.doc).content };
    },

    // The person chose: this device's text goes on top of whatever the server holds now (a tombstone or nothing takes it as an edit), and is
    // recorded as synced. For Keep the caller copied the server's version first.
    async force(id: string) {
      const [mine, doc] = await Promise.all([drafts.get(id), getDoc({ device, id, fetchFn })]);
      return upload(mine, doc ? stateOf(doc) : null);
    },

    // The tombstone is taken as the known state, so the draft counts as changed and is uploaded on top of it: an edit survives a delete.
    async keep(id: string) {
      const got = await getDocIfChanged({ device, id, state: null, fetchFn });
      if (got.kind === "doc") {
        await drafts.markSynced(id, { hash: "", updatedAt: got.doc.updatedAt, version: got.doc.version, deleted: !!got.doc.deleted });
      }
      return api.one(id);
    },

    // The rules are in docs/sync.md, "Dictionary and ignore list". `current()` gives the lists held now and `apply(changes)` makes the local
    // lists match what was decided. The record is saved only after the lists were sent and applied, so a failure is retried and never
    // mistaken for a local edit.
    async syncSettings({
      current,
      store,
      apply,
    }: {
      current(): Promise<{ words: unknown[]; ignored: unknown[] }>;
      store: { load(): Promise<SettingsSyncRecord | null>; save(record: SettingsSyncRecord): Promise<unknown> };
      apply(changes: ReturnType<typeof changesTo>): Promise<unknown>;
    }) {
      const rec = await store.load();
      const held = cleanLists(await current());
      const settle = async (version: number, target: { words: string[]; ignored: string[] }) => {
        const changes = changesTo(target, held);
        if (changes.any) await apply(changes);
        await store.save({ version, ...cleanLists(await current()) });
      };
      for (let attempt = 0; attempt < 3; attempt++) {
        const remote = await getSetting({ device, fetchFn });
        const send = async (lists: { words: string[]; ignored: string[] }) => {
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

    // The compared server version becomes this device's only while its stamp and the local revision still match. False when either moved.
    async takeServer(
      id: string,
      { stamp, updatedAt, stillCurrent = () => true }: { stamp: string; updatedAt: number; stillCurrent?: () => boolean },
    ) {
      const doc = await getDoc({ device, id, fetchFn });
      if (!doc || doc.deleted || `${doc.version}:${doc.updatedAt}` !== stamp || !stillCurrent()) return false;
      const mine = await drafts.get(id).catch(() => null);
      if (!mine || mine.updatedAt !== updatedAt || !stillCurrent()) return false;
      await drafts.applyRemote({ id, ...parseData(doc), createdAt: doc.createdAt, updatedAt: doc.updatedAt }, doc.version);
      return stillCurrent();
    },

    // Only if the server still holds the tombstone. Resolves to the removed draft, so the caller can offer Undo.
    async removeLocal(id: string) {
      const mine = await drafts.get(id).catch(() => null);
      const doc = mine && (await getDoc({ device, id, fetchFn }));
      if (!mine || !doc?.deleted) return null;
      await drafts.applyRemoteDelete(id, doc.version, doc.updatedAt);
      return mine;
    },
  };
  return api;
}
