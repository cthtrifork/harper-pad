// Calls to the sync server for an enrolled device (docs/sync.md, "Protocol"): every request carries the device token and a fresh DPoP
// proof. No Vue and no storage in here; `fetchFn` is a parameter for tests.
import { createProof } from "./dpop.js";
import { SyncError } from "./syncEnroll.js";

// One signed request. `device` is the record from syncDevice. Resolves to {status, body} for any answer except a 401, which means the
// server no longer accepts this device (revoked, or its key was lost): "signin". A server that cannot be reached is "unreachable".
export async function signedRequest({ device, method, path, body, headers: extra = {}, fetchFn = fetch.bind(globalThis) }) {
  const url = `${device.server}${path}`;
  const proof = await createProof({ privateKey: device.privateKey, publicJwk: device.publicJwk, method, url, token: device.token });
  const headers = { ...extra, Authorization: `DPoP ${device.token}`, DPoP: proof };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res;
  try {
    res = await fetchFn(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new SyncError("unreachable", "Server not reachable. Check the connection.");
  }
  if (res.status === 401) throw new SyncError("signin", "Signed out.");
  return { status: res.status, body: await res.json().catch(() => null) };
}

// Uploads one draft: PUT /docs/<id>, compare-and-set against `state`, the record of the last sync ({updatedAt, version}), or a draft the
// server has never seen when there is none. Resolves to {result: "ok", version} when the server took it, or {result: "conflict"} when
// somebody else changed it (settling that is the sync run's job, not this call's). Anything else is a SyncError.
export async function pushDraft({ device, draft, state, fetchFn }) {
  const data = JSON.stringify({ v: 1, format: draft.format, content: draft.content });
  const base = state ? { version: state.version, updatedAt: state.updatedAt } : { version: 0, updatedAt: 0 };
  const { status, body } = await signedRequest({
    device,
    method: "PUT",
    path: `/docs/${draft.id}`,
    body: { base, createdAt: draft.createdAt, updatedAt: draft.updatedAt, data },
    fetchFn,
  });
  if (status === 200 && Number.isInteger(body?.version)) return { result: "ok", version: body.version };
  if (status === 409) return { result: "conflict" };
  throw new SyncError("server", `Server error (${status}).`);
}

// The state of every draft the server holds, without their text: [{id, version, updatedAt, deleted}], tombstones included. Pages of 500
// in id order; a page shorter than that is the last.
export async function listDocs({ device, fetchFn }) {
  const out = [];
  for (let after = ""; ; ) {
    const { status, body } = await signedRequest({ device, method: "GET", path: `/docs?after=${after}&limit=500`, fetchFn });
    if (status !== 200 || !Array.isArray(body)) throw new SyncError("server", `Server error (${status}).`);
    out.push(...body);
    if (body.length < 500) return out;
    after = body[body.length - 1].id;
  }
}

// One draft with its text: {id, version, createdAt, updatedAt, deleted, data}, or null when the server has no such draft.
export async function getDoc({ device, id, fetchFn }) {
  const { status, body } = await signedRequest({ device, method: "GET", path: `/docs/${id}`, fetchFn });
  if (status === 404) return null;
  if (status !== 200 || typeof body?.data !== "string") throw new SyncError("server", `Server error (${status}).`);
  return body;
}

// The server's validator for a draft's state, as it writes it in an ETag: "<updatedAt>-<0 or 1 for deleted>".
export const etagOf = (state) => `"${state.updatedAt}-${state.deleted ? 1 : 0}"`;

// Asks for a draft only if the server's state differs from `state` (the one recorded at the last sync, or null for none). Resolves to
// {kind: "unchanged"} (a 304), {kind: "missing"} (the server has no such draft) or {kind: "doc", doc}.
export async function getDocIfChanged({ device, id, state, fetchFn }) {
  const headers = state ? { "If-None-Match": etagOf(state) } : {};
  const { status, body } = await signedRequest({ device, method: "GET", path: `/docs/${id}`, headers, fetchFn });
  if (status === 304) return { kind: "unchanged" };
  if (status === 404) return { kind: "missing" };
  if (status !== 200 || typeof body?.data !== "string") throw new SyncError("server", `Server error (${status}).`);
  return { kind: "doc", doc: body };
}

// Deletes a draft on the server: a tombstone on top of `state`, the server's state for it. Same answers as pushDraft.
export async function pushTombstone({ device, id, state, updatedAt, fetchFn }) {
  const base = state ? { version: state.version, updatedAt: state.updatedAt } : { version: 0, updatedAt: 0 };
  const { status, body } = await signedRequest({
    device,
    method: "PUT",
    path: `/docs/${id}`,
    body: { base, createdAt: 0, updatedAt, deleted: true, data: "" },
    fetchFn,
  });
  if (status === 200 && Number.isInteger(body?.version)) return { result: "ok", version: body.version };
  if (status === 409) return { result: "conflict" };
  throw new SyncError("server", `Server error (${status}).`);
}

// One synced setting, "words": {version, data}, or null when the server has none yet.
export async function getSetting({ device, key, fetchFn }) {
  const { status, body } = await signedRequest({ device, method: "GET", path: `/settings/${key}`, fetchFn });
  if (status === 404) return null;
  if (status !== 200 || !Number.isInteger(body?.version) || typeof body?.data !== "string")
    throw new SyncError("server", `Server error (${status}).`);
  return body;
}

// Writes a setting on top of `baseVersion` (0 for none). Resolves to {result: "ok", version} or {result: "conflict"}.
export async function putSetting({ device, key, baseVersion, data, fetchFn }) {
  const { status, body } = await signedRequest({ device, method: "PUT", path: `/settings/${key}`, body: { baseVersion, data }, fetchFn });
  if (status === 200 && Number.isInteger(body?.version)) return { result: "ok", version: body.version };
  if (status === 409) return { result: "conflict" };
  throw new SyncError("server", `Server error (${status}).`);
}
