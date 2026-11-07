import assert from "node:assert/strict";
import test from "node:test";
import { buildPolicy, syncOriginOf } from "./csp.ts";

// What the policy was before sync existed. Without a sync origin it must stay exactly this (docs/security.md).
const BEFORE = [
  "default-src 'none'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join("; ");

test("no sync origin: the desktop and web policies are what they were", () => {
  assert.equal(buildPolicy(), BEFORE);
  assert.equal(buildPolicy({ syncOrigin: "" }), BEFORE);
  assert.equal(buildPolicy({ syncOrigin: undefined }), BEFORE);
  assert.equal(buildPolicy({ web: true }), `${BEFORE}; manifest-src 'self'`);
});

test("a sync origin is added to connect-src and nothing else changes", () => {
  const desktop = buildPolicy({ syncOrigin: "https://sync.example.com" });
  assert.equal(desktop, BEFORE.replace("connect-src 'self'", "connect-src 'self' https://sync.example.com"));
  const web = buildPolicy({ web: true, syncOrigin: "https://sync.example.com" });
  assert.equal(web, `${desktop}; manifest-src 'self'`);
});

test("a trailing slash and a port are accepted and normalised", () => {
  assert.equal(syncOriginOf("https://sync.example.com/"), "https://sync.example.com");
  assert.equal(syncOriginOf(" https://sync.localhost:18443 "), "https://sync.localhost:18443");
});

for (const bad of [
  "sync.example.com",
  "http://sync.example.com",
  "https://sync.example.com/docs",
  "https://sync.example.com?x=1",
  "https://*.example.com",
  "https://sync.example.com; script-src *",
  "https://a.example.com https://b.example.com",
  "https:",
]) {
  test(`refuses ${JSON.stringify(bad)}`, () => assert.throws(() => syncOriginOf(bad), /SYNC_ORIGIN/));
}
