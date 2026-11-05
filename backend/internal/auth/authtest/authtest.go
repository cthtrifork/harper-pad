// Package authtest makes DPoP proofs the way the web client does (WebCrypto's ES256: a raw r||s signature), for tests of the code
// that verifies them.
package authtest

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"testing"
)

// Key is a device's signing key.
type Key struct{ Priv *ecdsa.PrivateKey }

// NewKey generates a P-256 key.
func NewKey(t testing.TB) Key {
	t.Helper()
	k, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return Key{k}
}

// JWK is the public key as a JWK object.
func (k Key) JWK() map[string]any {
	b := func(n []byte) string { return base64.RawURLEncoding.EncodeToString(pad32(n)) }
	return map[string]any{"kty": "EC", "crv": "P-256", "x": b(k.Priv.X.Bytes()), "y": b(k.Priv.Y.Bytes())}
}

// Claims are the payload of a proof; a zero JTI and a zero ATH are left out. The verifier uses the real clock, so IAT is normally
// time.Now().Unix() (the library that checks proofs reads the clock itself).
type Claims struct {
	JTI, HTM, HTU, ATH string
	IAT                int64
}

// Proof signs a proof with the given header and claims. A nil header means the right one for k.
func (k Key) Proof(t testing.TB, header map[string]any, c Claims) string {
	t.Helper()
	if header == nil {
		header = map[string]any{"typ": "dpop+jwt", "alg": "ES256", "jwk": k.JWK()}
	}
	pay := map[string]any{"jti": c.JTI, "htm": c.HTM, "htu": c.HTU, "iat": c.IAT}
	if c.JTI == "" {
		delete(pay, "jti")
	}
	if c.ATH != "" {
		pay["ath"] = c.ATH
	}
	return k.sign(t, header, pay)
}

func (k Key) sign(t testing.TB, header, payload map[string]any) string {
	t.Helper()
	enc := func(v any) string {
		b, err := json.Marshal(v)
		if err != nil {
			t.Fatal(err)
		}
		return base64.RawURLEncoding.EncodeToString(b)
	}
	signing := enc(header) + "." + enc(payload)
	digest := sha256.Sum256([]byte(signing))
	r, s, err := ecdsa.Sign(rand.Reader, k.Priv, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	sig := append(pad32(r.Bytes()), pad32(s.Bytes())...)
	return signing + "." + base64.RawURLEncoding.EncodeToString(sig)
}

// ATH is the ath claim for a device token.
func ATH(token string) string {
	h := sha256.Sum256([]byte(token))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

func pad32(b []byte) []byte { return append(make([]byte, 32-len(b)), b...) }
