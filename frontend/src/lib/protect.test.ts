import assert from "node:assert/strict";
import { test } from "node:test";
import { clearTitle, isProtected, newSession, seal, unlock, WrongPassphrase } from "./protect.ts";

const cost = { memoryKiB: 64, passes: 1 }; // far below the real cost, to keep the tests fast
const ID = "0123456789abcdef0123456789abcdef";
const body = "# Secret\nthe body";
const title = "Meeting notes"; // not the first line: the title is chosen, not taken from the text

test("seal and unlock round trip, and the envelope shows only the title", async () => {
  const session = await newSession("pw", cost);
  const env = await seal(session, ID, body, title);
  assert.ok(isProtected(env));
  assert.ok(!env.includes("Secret") && !env.includes("the body"));
  assert.equal(clearTitle(env), title);
  assert.equal((await unlock(env, ID, "pw", cost)).content, body);
});

test("a plain draft has no list title", () => {
  assert.equal(clearTitle("plain text"), "");
});

test("a wrong passphrase is refused", async () => {
  const env = await seal(await newSession("pw", cost), ID, body, title);
  await assert.rejects(unlock(env, ID, "other", cost), WrongPassphrase);
});

test("a blob cannot move to another draft", async () => {
  const env = await seal(await newSession("pw", cost), ID, body, title);
  await assert.rejects(unlock(env, "f".repeat(32), "pw", cost), WrongPassphrase);
});

test("every write has a new nonce but the session reopens all of them", async () => {
  const session = await newSession("pw", cost);
  const a = await seal(session, ID, body, title);
  const b = await seal(session, ID, body, title);
  assert.notEqual(a, b);
  assert.equal((await unlock(b, ID, "pw", cost)).content, body);
});

test("tampering is detected", async () => {
  const env = await seal(await newSession("pw", cost), ID, body, title);
  const json = JSON.parse(env.slice("hp-protected:1:".length));
  json.c = json.c.slice(0, -4) + (json.c.endsWith("AAAA") ? "BBBB" : "AAAA");
  await assert.rejects(unlock(`hp-protected:1:${JSON.stringify(json)}`, ID, "pw", cost), WrongPassphrase);
});

test("the draft list summary of a protected draft has the chosen title, no excerpt and no tasks", async () => {
  const { summarize } = await import("./summarize.ts");
  const session = await newSession("pw", cost);
  const listed = summarize(await seal(session, ID, "- [ ] a task\nbody", title));
  assert.deepEqual(listed, { title, excerpt: "hp-protected", tasks: [], tasksTotal: 0, tasksDone: 0 });
  assert.equal(summarize(await seal(session, ID, body, "")).title, "Locked draft");
});

test("a newer version opens with the key already held, but not with another salt", async () => {
  const { openWith } = await import("./protect.ts");
  const session = await newSession("pw", cost);
  const env = await seal(session, ID, body, title);
  assert.equal(await openWith(session, env, ID), body);
  const other = await seal(await newSession("pw", cost), ID, body, title);
  assert.equal(await openWith(session, other, ID), null);
});

test("a draft protected before titles existed lists as Locked draft and still opens", async () => {
  const { summarize } = await import("./summarize.ts");
  const session = await newSession("pw", cost);
  // The earlier form: the title (if shown) beside the ciphertext, and a title inside the encrypted text.
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify({ v: 1, content: body, title: "Secret" }));
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(ID) }, session.key, plain),
  );
  const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
  const old = `hp-protected:1:${JSON.stringify({ s: b64(session.salt), n: b64(nonce), c: b64(cipher) })}`;
  assert.equal(summarize(old).title, "Locked draft");
  assert.equal(clearTitle(old), "");
  assert.equal((await unlock(old, ID, "pw", cost)).content, body);
});

test("a changed, removed or added title is detected, because the seal covers it", async () => {
  const session = await newSession("pw", cost);
  const withTitle = JSON.parse((await seal(session, ID, body, title)).slice("hp-protected:1:".length));
  const without = JSON.parse((await seal(session, ID, body, "")).slice("hp-protected:1:".length));
  const pack = (env) => `hp-protected:1:${JSON.stringify(env)}`;
  await assert.rejects(unlock(pack({ ...withTitle, t: "Payroll passwords" }), ID, "pw", cost), WrongPassphrase);
  const { t: _gone, ...stripped } = withTitle;
  await assert.rejects(unlock(pack(stripped), ID, "pw", cost), WrongPassphrase);
  await assert.rejects(unlock(pack({ ...without, t: title }), ID, "pw", cost), WrongPassphrase);
  assert.equal((await unlock(pack(withTitle), ID, "pw", cost)).content, body); // untouched still opens
});

test("a large draft is sealed and opened (the encoding is done in bounded pieces)", async () => {
  const big = "lorem ipsum dolor sit amet ".repeat(30000); // about 800 KB
  const session = await newSession("pw", cost);
  const env = await seal(session, ID, big, title);
  assert.equal((await unlock(env, ID, "pw", cost)).content, big);
});
