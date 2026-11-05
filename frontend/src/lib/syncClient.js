// Calls to the sync server for an enrolled device (docs/sync.md, "Protocol"): every request carries the device token and a fresh DPoP
// proof. No Vue and no storage in here; `fetchFn` is a parameter for tests.
import { createProof } from "./dpop.js";
import { SyncError } from "./syncEnroll.js";

// One signed request. `device` is the record from syncDevice. Resolves to {status, body} for any answer except a 401, which means the
// server no longer accepts this device (revoked, or its key was lost): "signin". A server that cannot be reached is "unreachable".
export async function signedRequest({ device, method, path, body, fetchFn = fetch.bind(globalThis) }) {
  const url = `${device.server}${path}`;
  const proof = await createProof({ privateKey: device.privateKey, publicJwk: device.publicJwk, method, url, token: device.token });
  const headers = { Authorization: `DPoP ${device.token}`, DPoP: proof };
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
    throw new SyncError("unreachable", "The server could not be reached.");
  }
  if (res.status === 401) throw new SyncError("signin", "The server no longer accepts this device.");
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
  throw new SyncError("server", `The server answered ${status}.`);
}
