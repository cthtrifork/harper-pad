// The device's signing key and the DPoP proof sent with every sync request (docs/sync.md, "Limiting the damage of a stolen device";
// RFC 9449). The server (backend/internal/auth/dpop.go) checks exactly what is built here: ES256, the public key in the header, htm,
// htu without query or fragment, iat, a fresh jti and, with a token, ath. No storage and no network in this file, so it is unit-tested.

const encoder = new TextEncoder();

export type PublicJwk = Pick<JsonWebKey, "kty" | "crv" | "x" | "y">;
export interface DeviceKey {
  privateKey: CryptoKey;
  publicJwk: PublicJwk;
}

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  let s = "";
  for (const b of new Uint8Array(bytes as ArrayBuffer)) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const b64urlJson = (value: unknown) => b64url(encoder.encode(JSON.stringify(value)));

// A new ECDSA P-256 key. The private key is not extractable (script cannot read its bytes); the public key always can be. Keep only the
// private CryptoKey (a whole CryptoKeyPair is rejected by older WebKit when stored in IndexedDB) and the public JWK next to it.
export async function generateDeviceKey(): Promise<DeviceKey> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { kty, crv, x, y } };
}

// The URL as the server compares it: no query, no fragment.
function htu(url: string | URL): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

// A proof for one request: a compact JWS signed with ES256. WebCrypto's ECDSA signature is already the JWS format (raw r||s, 64
// bytes), so no conversion is needed. `token` is the device token, or empty for POST /enroll. `now` is a parameter for tests.
export async function createProof({
  privateKey,
  publicJwk,
  method,
  url,
  token = "",
  now = Date.now(),
}: DeviceKey & { method: string; url: string | URL; token?: string; now?: number }): Promise<string> {
  const header = { typ: "dpop+jwt", alg: "ES256", jwk: publicJwk };
  const claims: Record<string, string | number> = {
    jti: b64url(crypto.getRandomValues(new Uint8Array(16))),
    htm: method.toUpperCase(),
    htu: htu(url),
    iat: Math.floor(now / 1000),
  };
  if (token) claims.ath = b64url(await crypto.subtle.digest("SHA-256", encoder.encode(token)));
  const signingInput = `${b64urlJson(header)}.${b64urlJson(claims)}`;
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, encoder.encode(signingInput));
  return `${signingInput}.${b64url(signature)}`;
}
