// Enrolling this device (docs/sync.md, "Enrollment"): read the invite URL the user pasted, make the device key, call POST /enroll with a
// proof signed by that key, and keep what comes back. Nothing here touches the UI; the caller shows `SyncError.message`.
import { createProof, generateDeviceKey } from "./dpop.js";

// What went wrong, as a code the UI can switch on and a message it can show.
export class SyncError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "SyncError";
    this.code = code;
  }
}

// "https://sync.example.com/join#<token>" -> {server: "https://sync.example.com", invite: "<token>"}. The token is in the fragment so it is
// never sent in a request line or written to an access log. The server address comes from the URL alone, so there is no separate field.
export function parseInviteUrl(text) {
  let url;
  try {
    url = new URL(String(text).trim());
  } catch {
    throw new SyncError("bad-url", "Not a link. Paste the full invite address.");
  }
  if (url.protocol !== "https:") throw new SyncError("not-https", "The address must start with https://.");
  const invite = url.hash.slice(1);
  if (url.pathname !== "/join" || !/^[A-Za-z0-9_-]{43}$/.test(invite)) {
    throw new SyncError("bad-url", "Not an invite link.");
  }
  return { server: url.origin, invite };
}

// The device's name is the one typed in the admin UI when the invite was made, so it is not asked for here.
// Spends the invite and saves the device record through `store` (syncDevice from backend.ts). `fetchFn` is a parameter for tests.
// A failed attempt saves nothing, and the invite is spent only when the server accepted it.
export async function enrollDevice({ text, store, fetchFn = fetch.bind(globalThis) }) {
  const { server, invite } = parseInviteUrl(text);
  const key = await generateDeviceKey();
  const url = `${server}/enroll`;
  const proof = await createProof({ ...key, method: "POST", url });

  let res;
  try {
    res = await fetchFn(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", DPoP: proof },
      body: JSON.stringify({ invite }),
      credentials: "omit",
      referrerPolicy: "no-referrer",
    });
  } catch {
    throw new SyncError("unreachable", "Server not reachable. Check the connection.");
  }
  if (res.status === 401) throw new SyncError("rejected", "Invite not accepted. Ask for a new one.");
  if (!res.ok) throw new SyncError("server", `Server error (${res.status}). Try again later.`);

  const body = await res.json().catch(() => null);
  if (typeof body?.deviceToken !== "string" || body.token_type !== "DPoP") {
    throw new SyncError("server", "Unexpected answer from the server.");
  }
  await store.save({ server, token: body.deviceToken, ...key });
  return { server };
}
