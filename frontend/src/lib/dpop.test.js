import assert from "node:assert/strict";
import test from "node:test";
import { createProof, generateDeviceKey } from "./dpop.js";

const decode = (part) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const sha256 = async (text) => Buffer.from(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))).toString("base64url");

async function proofOf(key, extra = {}) {
  const proof = await createProof({ ...key, method: "put", url: "https://sync.example.com/docs/abc?x=1#frag", token: "tok", ...extra });
  const [h, p, s] = proof.split(".");
  return { proof, header: decode(h), claims: decode(p), signature: Buffer.from(s, "base64url"), signed: `${h}.${p}` };
}

test("the private key cannot be exported, the public key is a plain JWK", async () => {
  const key = await generateDeviceKey();
  assert.equal(key.privateKey.extractable, false);
  await assert.rejects(crypto.subtle.exportKey("jwk", key.privateKey));
  assert.deepEqual(Object.keys(key.publicJwk).sort(), ["crv", "kty", "x", "y"]);
  assert.equal(key.publicJwk.crv, "P-256");
});

test("the header is dpop+jwt, ES256, with the public key and no private member", async () => {
  const { header } = await proofOf(await generateDeviceKey());
  assert.equal(header.typ, "dpop+jwt");
  assert.equal(header.alg, "ES256");
  assert.equal(header.jwk.d, undefined);
});

test("the claims name the method, the URL without query or fragment, the time and the token hash", async () => {
  const { claims } = await proofOf(await generateDeviceKey(), { now: 1_700_000_000_999 });
  assert.equal(claims.htm, "PUT");
  assert.equal(claims.htu, "https://sync.example.com/docs/abc");
  assert.equal(claims.iat, 1_700_000_000);
  assert.equal(claims.ath, await sha256("tok"));
  assert.match(claims.jti, /^[A-Za-z0-9_-]{22}$/);
});

test("a proof for /enroll has no ath", async () => {
  const { claims } = await proofOf(await generateDeviceKey(), { token: "" });
  assert.equal("ath" in claims, false);
});

test("the signature is raw r||s and verifies against the public key; a changed payload does not", async () => {
  const key = await generateDeviceKey();
  const { signature, signed } = await proofOf(key);
  assert.equal(signature.length, 64);
  const pub = await crypto.subtle.importKey("jwk", key.publicJwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
  const verify = (text) => crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pub, signature, new TextEncoder().encode(text));
  assert.equal(await verify(signed), true);
  assert.equal(await verify(`${signed}x`), false);
});

test("every proof has its own jti", async () => {
  const key = await generateDeviceKey();
  const a = await proofOf(key);
  const b = await proofOf(key);
  assert.notEqual(a.claims.jti, b.claims.jti);
});
