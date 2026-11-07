import assert from "node:assert/strict";
import test from "node:test";
import { enrollDevice, parseInviteUrl, SyncError } from "./syncEnroll.ts";

const INVITE = "A".repeat(43);
const url = `https://sync.example.com/join#${INVITE}`;
const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

const memoryStore = () => {
  const s = { saved: null, save: async (r) => (s.saved = r) };
  return s;
};
const reply = (status: number, body: unknown) => async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const fake = (fn: (u: string, init: RequestInit & { body?: string; headers: Record<string, string> }) => unknown) =>
  fn as unknown as typeof fetch;

test("the invite URL gives the server and the token", () => {
  assert.deepEqual(parseInviteUrl(`  ${url}\n`), { server: "https://sync.example.com", invite: INVITE });
  assert.equal(parseInviteUrl(`https://sync.example.com:8443/join#${INVITE}`).server, "https://sync.example.com:8443");
});

for (const [name, text, code] of [
  ["not a link", "hello", "bad-url"],
  ["plain http", `http://sync.example.com/join#${INVITE}`, "not-https"],
  ["no token", "https://sync.example.com/join", "bad-url"],
  ["token of the wrong shape", "https://sync.example.com/join#short", "bad-url"],
  ["another path", `https://sync.example.com/docs#${INVITE}`, "bad-url"],
]) {
  test(`refuses ${name}`, () => assert.throws(() => parseInviteUrl(text), { code }));
}

test("enrolls: a proof without ath, the invite in the body only, and the record is saved", async () => {
  const store = memoryStore();
  let call: { u: string; init: RequestInit & { body?: string; headers: Record<string, string> } } | undefined;
  const fetchFn = fake(async (u, init) => {
    call = { u, init };
    return reply(200, { deviceToken: "tok", token_type: "DPoP" })();
  });
  const out = await enrollDevice({ text: url, store, fetchFn });
  assert.deepEqual(out, { server: "https://sync.example.com" });
  assert.equal(call.u, "https://sync.example.com/enroll");
  assert.equal(call.init.method, "POST");
  assert.deepEqual(JSON.parse(call.init.body), { invite: INVITE });
  assert.equal(call.u.includes(INVITE), false);
  const [h, p] = call.init.headers.DPoP.split(".");
  assert.deepEqual(decode(h).jwk, store.saved.publicJwk);
  assert.equal(decode(p).htm, "POST");
  assert.equal(decode(p).htu, "https://sync.example.com/enroll");
  assert.equal("ath" in decode(p), false);
  assert.equal(store.saved.token, "tok");
  assert.equal(store.saved.privateKey.extractable, false);
});

for (const [name, fetchFn, code] of [
  ["a spent or wrong invite", reply(401, { detail: "unauthorized" }), "rejected"],
  ["a server error", reply(500, {}), "server"],
  ["an answer of the wrong shape", reply(200, { deviceToken: 5 }), "server"],
  [
    "a server that cannot be reached",
    async () => {
      throw new TypeError("fetch failed");
    },
    "unreachable",
  ],
]) {
  test(`${name} saves nothing`, async () => {
    const store = memoryStore();
    await assert.rejects(
      enrollDevice({ text: url, store, fetchFn: fetchFn as unknown as typeof fetch }),
      (err) => err instanceof SyncError && err.code === code,
    );
    assert.equal(store.saved, null);
  });
}
