// The DPoP proof sent with every sync request (docs/sync.md, "Authentication"). backend/internal/auth/dpop.go checks exactly what is
// built here. No storage and no network, so it is unit-tested.

const encoder = new TextEncoder();

export type PublicJwk = Pick<JsonWebKey, "kty" | "crv" | "x" | "y">;
interface DeviceKey {
  privateKey: CryptoKey;
  publicJwk: PublicJwk;
}

const b64url = (bytes: ArrayBuffer | Uint8Array) => {
  let s = "";
  for (const b of new Uint8Array(bytes as ArrayBuffer)) s += String.fromCharCode(b);
  return btoa(s).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
};
const b64urlJson = (value: unknown) => b64url(encoder.encode(JSON.stringify(value)));

// Keep the private CryptoKey and the public JWK, not the whole pair: older WebKit rejects a CryptoKeyPair in IndexedDB.
export async function generateDeviceKey(): Promise<DeviceKey> {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, false, ["sign", "verify"]);
  const { kty, crv, x, y } = await crypto.subtle.exportKey("jwk", pair.publicKey);
  return { privateKey: pair.privateKey, publicJwk: { kty, crv, x, y } };
}

function htu(url: string | URL): string {
  const u = new URL(url);
  return `${u.origin}${u.pathname}`;
}

// WebCrypto's ECDSA signature is already the JWS format (raw r||s), so it needs no conversion. `token` is empty for POST /enroll.
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
