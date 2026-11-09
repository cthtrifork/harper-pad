import assert from "node:assert/strict";
import { test } from "node:test";
import { clearTitle, isProtected, newSession, seal, unlock, WrongPassphrase } from "./protect.ts";

const cost = { memoryKiB: 64, passes: 1 }; // far below the real cost, to keep the tests fast
const ID = "0123456789abcdef0123456789abcdef";
const text = { content: "# Secret\nthe body", title: "Secret" };

test("seal and unlock round trip, and the envelope shows no text", async () => {
  const session = await newSession("pw", cost);
  const env = await seal(session, ID, text, false);
  assert.ok(isProtected(env));
  assert.ok(!env.includes("Secret") && !env.includes("body"));
  assert.equal(clearTitle(env), null);
  const opened = await unlock(env, ID, "pw", cost);
  assert.deepEqual(opened.text, text);
});

test("the title is in the clear only when asked", async () => {
  const session = await newSession("pw", cost);
  const env = await seal(session, ID, text, true);
  assert.equal(clearTitle(env), "Secret");
  assert.ok(!env.includes("the body"));
  assert.equal(clearTitle("plain text"), null);
});

test("a wrong passphrase is refused", async () => {
  const env = await seal(await newSession("pw", cost), ID, text, false);
  await assert.rejects(unlock(env, ID, "other", cost), WrongPassphrase);
});

test("a blob cannot move to another draft", async () => {
  const env = await seal(await newSession("pw", cost), ID, text, false);
  await assert.rejects(unlock(env, "f".repeat(32), "pw", cost), WrongPassphrase);
});

test("every write has a new nonce but the session reopens all of them", async () => {
  const session = await newSession("pw", cost);
  const a = await seal(session, ID, text, false);
  const b = await seal(session, ID, text, false);
  assert.notEqual(a, b);
  assert.deepEqual((await unlock(b, ID, "pw", cost)).text, text);
});

test("tampering is detected", async () => {
  const env = await seal(await newSession("pw", cost), ID, text, false);
  const json = JSON.parse(env.slice("hp-protected:1:".length));
  json.c = json.c.slice(0, -4) + (json.c.endsWith("AAAA") ? "BBBB" : "AAAA");
  await assert.rejects(unlock(`hp-protected:1:${JSON.stringify(json)}`, ID, "pw", cost), WrongPassphrase);
});

test("the draft list summary of a protected draft has no excerpt or tasks", async () => {
  const { summarize } = await import("./summarize.ts");
  const session = await newSession("pw", cost);
  const hidden = summarize(await seal(session, ID, { content: "- [ ] a task\nbody", title: "Secret" }, false));
  assert.deepEqual(hidden, { title: "Locked draft", excerpt: "", tasks: [], tasksTotal: 0, tasksDone: 0 });
  assert.equal(summarize(await seal(session, ID, text, true)).title, "Secret");
});
