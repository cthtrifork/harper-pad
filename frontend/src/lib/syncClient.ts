// Calls to the sync server for an enrolled device (docs/sync.md, "Protocol"). `fetchFn` is a parameter for tests.
import { createProof } from "./dpop.ts";
import type { DeviceRecord } from "./syncDevice.ts";
import { SyncError } from "./syncEnroll.ts";

export interface DocState {
  id: string;
  version: number;
  updatedAt: number;
  deleted: boolean;
}

export interface Doc extends DocState {
  createdAt: number;
  /** JSON: {v, format, content} */
  data: string;
}

interface Settings {
  version: number;
  words: string[];
  ignored: string[];
}

type Answer = { result: "ok"; version: number } | { result: "conflict" };
type Base = { version: number; updatedAt: number } | null;
type Fetch = typeof fetch;

// What a server answer may hold; the callers check what they read.
interface Body {
  version?: number;
  data?: string;
  detail?: string;
  title?: string;
}

// Any answer but a 401 resolves. A 401 means the server no longer accepts this device (revoked, or its key was lost): "signin". A server
// that cannot be reached is "unreachable".
export async function signedRequest<T = Body>({
  device,
  method,
  path,
  body,
  headers: extra = {},
  fetchFn = fetch.bind(globalThis),
}: {
  device: DeviceRecord;
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  fetchFn?: Fetch;
}): Promise<{ status: number; body: T | null }> {
  const url = `${device.server}${path}`;
  const proof = await createProof({ privateKey: device.privateKey, publicJwk: device.publicJwk, method, url, token: device.token });
  const headers: Record<string, string> = { ...extra, Authorization: `DPoP ${device.token}`, DPoP: proof };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  let res: Response;
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

// The server refused the draft itself (too large, malformed, not allowed), with a short reason for the chip. A 5xx is a server fault, which
// the callers treat as "try again later".
const baseOf = (state: Base) => (state ? { version: state.version, updatedAt: state.updatedAt } : { version: 0, updatedAt: 0 });

function rejected(status: number, body: Body | null) {
  const text = status === 413 ? "it is too large" : String(body?.detail || body?.title || `the server answered ${status}`);
  return new SyncError("rejected", text.replace(/\.$/, ""));
}

// Compare-and-set against `state`, the record of the last sync (none: a draft the server has never seen). "conflict" means somebody else
// changed it; settling that is the sync run's job. Anything else is a SyncError.
export async function pushDraft({
  device,
  draft,
  state,
  fetchFn,
}: {
  device: DeviceRecord;
  draft: { id: string; format: string; content: string; createdAt: number; updatedAt: number };
  state: Base;
  fetchFn?: Fetch;
}): Promise<Answer> {
  const data = JSON.stringify({ v: 1, format: draft.format, content: draft.content });
  const base = baseOf(state);
  const { status, body } = await signedRequest({
    device,
    method: "PUT",
    path: `/docs/${draft.id}`,
    body: { base, createdAt: draft.createdAt, updatedAt: draft.updatedAt, data },
    fetchFn,
  });
  if (status === 200 && Number.isInteger(body?.version)) return { result: "ok", version: (body as Body).version as number };
  if (status === 409) return { result: "conflict" };
  if (status >= 400 && status < 500) throw rejected(status, body);
  throw new SyncError("server", `Server error (${status}).`);
}

// Every draft the server holds, tombstones included, without their text. Pages of 500 in id order; a shorter page is the last.
export async function listDocs({ device, fetchFn }: { device: DeviceRecord; fetchFn?: Fetch }) {
  const out: DocState[] = [];
  for (let after = ""; ; ) {
    const { status, body } = await signedRequest<DocState[]>({ device, method: "GET", path: `/docs?after=${after}&limit=500`, fetchFn });
    if (status !== 200 || !Array.isArray(body)) throw new SyncError("server", `Server error (${status}).`);
    out.push(...body);
    if (body.length < 500) return out;
    after = body[body.length - 1].id;
  }
}

// null when the server has no such draft.
export async function getDoc({ device, id, fetchFn }: { device: DeviceRecord; id: string; fetchFn?: Fetch }): Promise<Doc | null> {
  const { status, body } = await signedRequest<Doc>({ device, method: "GET", path: `/docs/${id}`, fetchFn });
  if (status === 404) return null;
  if (status !== 200 || typeof body?.data !== "string") throw new SyncError("server", `Server error (${status}).`);
  return body;
}

// The validator the server writes in an ETag: "<updatedAt>-<0 or 1 for deleted>".
const etagOf = (state: { updatedAt: number; deleted?: boolean }) => `"${state.updatedAt}-${state.deleted ? 1 : 0}"`;

// Asks for the draft only if the server's state differs from `state`, the one recorded at the last sync (a 304 is "unchanged").
export async function getDocIfChanged({
  device,
  id,
  state,
  fetchFn,
}: {
  device: DeviceRecord;
  id: string;
  state: { updatedAt: number; deleted?: boolean } | null;
  fetchFn?: Fetch;
}): Promise<{ kind: "unchanged" } | { kind: "missing" } | { kind: "doc"; doc: Doc }> {
  const headers: Record<string, string> = state ? { "If-None-Match": etagOf(state) } : {};
  const { status, body } = await signedRequest<Doc>({ device, method: "GET", path: `/docs/${id}`, headers, fetchFn });
  if (status === 304) return { kind: "unchanged" };
  if (status === 404) return { kind: "missing" };
  if (status !== 200 || typeof body?.data !== "string") throw new SyncError("server", `Server error (${status}).`);
  return { kind: "doc", doc: body as Doc };
}

// A tombstone on top of `state`, the server's state for the draft. Same answers as pushDraft.
export async function pushTombstone({
  device,
  id,
  state,
  updatedAt,
  fetchFn,
}: {
  device: DeviceRecord;
  id: string;
  state: Base;
  updatedAt: number;
  fetchFn?: Fetch;
}): Promise<Answer> {
  const base = baseOf(state);
  const { status, body } = await signedRequest({
    device,
    method: "PUT",
    path: `/docs/${id}`,
    body: { base, createdAt: 0, updatedAt, deleted: true, data: "" },
    fetchFn,
  });
  if (status === 200 && Number.isInteger(body?.version)) return { result: "ok", version: (body as Body).version as number };
  if (status === 409) return { result: "conflict" };
  throw new SyncError("server", `Server error (${status}).`);
}

// null when the server has no dictionary and ignore list yet.
export async function getSetting({ device, fetchFn }: { device: DeviceRecord; fetchFn?: Fetch }): Promise<Settings | null> {
  const { status, body } = await signedRequest<Settings>({ device, method: "GET", path: "/settings", fetchFn });
  if (status === 404) return null;
  if (status !== 200 || !Number.isInteger(body?.version)) throw new SyncError("server", `Server error (${status}).`);
  return body;
}

// On top of `baseVersion` (0 for none).
export async function putSetting({
  device,
  baseVersion,
  words,
  ignored,
  fetchFn,
}: {
  device: DeviceRecord;
  baseVersion: number;
  words: string[];
  ignored: string[];
  fetchFn?: Fetch;
}): Promise<Answer> {
  const { status, body } = await signedRequest({
    device,
    method: "PUT",
    path: "/settings",
    body: { baseVersion, words, ignored },
    fetchFn,
  });
  if (status === 200 && Number.isInteger(body?.version)) return { result: "ok", version: (body as Body).version as number };
  if (status === 409) return { result: "conflict" };
  throw new SyncError("server", `Server error (${status}).`);
}
