import assert from "node:assert/strict";
import test from "node:test";
import { generateDeviceKey } from "./dpop.ts";
import { pushDraft, signedRequest } from "./syncClient.ts";

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const draft = { id: "a".repeat(32), format: "markdown", content: "hello", createdAt: 1000, updatedAt: 2000 };

async function device() {
  return { server: "https://sync.example.com", token: "tok", ...(await generateDeviceKey()) };
}
const reply = (status: number, body: unknown) => ({ status, json: async () => body });
const fake = (fn: (u: string, init: RequestInit & { body?: string; headers: Record<string, string> }) => unknown) =>
  fn as unknown as typeof fetch;
const answer = (status: number, body: unknown) => fake(async () => reply(status, body));

test("a request carries the token, a proof for that method and URL, and no cookies", async () => {
  let call: { u: string; init: RequestInit & { headers: Record<string, string> } } | undefined;
  const dev = await device();
  await signedRequest({
    device: dev,
    method: "GET",
    path: "/docs?after=x",
    fetchFn: fake(async (u, init) => {
      call = { u, init };
      return reply(200, []);
    }),
  });
  assert.equal(call.u, "https://sync.example.com/docs?after=x");
  assert.equal(call.init.headers.Authorization, "DPoP tok");
  assert.equal(call.init.credentials, "omit");
  const claims = decode(call.init.headers.DPoP.split(".")[1]);
  assert.equal(claims.htm, "GET");
  assert.equal(claims.htu, "https://sync.example.com/docs");
  assert.ok(claims.ath);
});

test("a 401 means sign in again, and a network failure means unreachable", async () => {
  const dev = await device();
  await assert.rejects(signedRequest({ device: dev, method: "GET", path: "/docs", fetchFn: answer(401, {}) }), { code: "signin" });
  const down = async () => {
    throw new TypeError("fetch failed");
  };
  await assert.rejects(signedRequest({ device: dev, method: "GET", path: "/docs", fetchFn: down }), { code: "unreachable" });
});

test("a new draft is pushed against version 0 and the app's blob", async () => {
  let sent: { base: unknown; createdAt: number; updatedAt: number; data: string } | undefined;
  const fetchFn = fake(async (_u, init) => {
    sent = JSON.parse(init.body);
    return reply(200, { version: 1 });
  });
  const out = await pushDraft({ device: await device(), draft, state: null, fetchFn });
  assert.deepEqual(out, { result: "ok", version: 1 });
  assert.deepEqual(sent.base, { version: 0, updatedAt: 0 });
  assert.equal(sent.createdAt, 1000);
  assert.equal(sent.updatedAt, 2000);
  assert.deepEqual(JSON.parse(sent.data), { v: 1, format: "markdown", content: "hello" });
});

test("a draft that was synced before is pushed on top of the recorded state", async () => {
  let sent: { base: unknown } | undefined;
  const fetchFn = fake(async (_u, init) => {
    sent = JSON.parse(init.body);
    return reply(200, { version: 4 });
  });
  await pushDraft({
    device: await device(),
    draft,
    state: { version: 3, updatedAt: 1500, hash: "h", deleted: false } as { version: number; updatedAt: number },
    fetchFn,
  });
  assert.deepEqual(sent.base, { version: 3, updatedAt: 1500 });
});

test("a 409 is a conflict to settle later, other answers are errors", async () => {
  const dev = await device();
  assert.deepEqual(await pushDraft({ device: dev, draft, state: null, fetchFn: answer(409, { current: {} }) }), { result: "conflict" });
  await assert.rejects(pushDraft({ device: dev, draft, state: null, fetchFn: answer(200, {}) }), { code: "server" });
  await assert.rejects(pushDraft({ device: dev, draft, state: null, fetchFn: answer(503, {}) }), { code: "server" }); // a server fault: tried again later
});

test("a draft the server refuses is rejected with a short reason: too large, or the server's own detail", async () => {
  const dev = await device();
  await assert.rejects(pushDraft({ device: dev, draft, state: null, fetchFn: answer(413, {}) }), {
    code: "rejected",
    message: "it is too large",
  });
  await assert.rejects(pushDraft({ device: dev, draft, state: null, fetchFn: answer(422, { detail: "format is not known." }) }), {
    code: "rejected",
    message: "format is not known",
  });
  await assert.rejects(pushDraft({ device: dev, draft, state: null, fetchFn: answer(400, null) }), {
    code: "rejected",
    message: "the server answered 400",
  });
});
