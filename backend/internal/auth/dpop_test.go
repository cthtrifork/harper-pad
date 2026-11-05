package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"strings"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth/authtest"
)

const htu = "https://sync.example.org/enroll"

func verifier(t *testing.T) *Verifier {
	t.Helper()
	v := NewVerifier()
	t.Cleanup(v.Close)
	return v
}

// claims are valid for POST htu, issued now. The window tests use margins of a few seconds because the library that checks the
// iat reads the real clock.
func claims() authtest.Claims {
	return authtest.Claims{JTI: "j1", HTM: "POST", HTU: htu, IAT: time.Now().Unix()}
}

// thumbprint is the RFC 7638 thumbprint of a P-256 JWK, computed here from the spec so the test does not trust the library's output.
func thumbprint(jwk map[string]any) string {
	canonical := `{"crv":"P-256","kty":"EC","x":"` + jwk["x"].(string) + `","y":"` + jwk["y"].(string) + `"}`
	h := sha256.Sum256([]byte(canonical))
	return base64.RawURLEncoding.EncodeToString(h[:])
}

func TestVerifyAcceptsAGoodProof(t *testing.T) {
	k := authtest.NewKey(t)
	p, err := verifier(t).Verify(k.Proof(t, nil, claims()), "POST", htu, "")
	if err != nil {
		t.Fatal(err)
	}
	if want := thumbprint(k.JWK()); p.KeyThumbprint != want {
		t.Errorf("thumbprint = %s, want the RFC 7638 value %s", p.KeyThumbprint, want)
	}
	// The same key gives the same value in a later proof, and another key a different one.
	v := verifier(t)
	c := claims()
	c.JTI = "j2"
	p2, err := v.Verify(k.Proof(t, nil, c), "POST", htu, "")
	if err != nil || p2.KeyThumbprint != p.KeyThumbprint {
		t.Errorf("second proof: %v, same key = %v", err, p2.KeyThumbprint == p.KeyThumbprint)
	}
	if other, _ := v.Verify(authtest.NewKey(t).Proof(t, nil, claims()), "POST", htu, ""); other.KeyThumbprint == p.KeyThumbprint {
		t.Error("two keys share a thumbprint")
	}
}

func TestVerifyChecksTheClaims(t *testing.T) {
	k := authtest.NewKey(t)
	const token = "device-token"
	secs := func(d int64) func(*authtest.Claims) { return func(c *authtest.Claims) { c.IAT += d } }
	tests := []struct {
		name   string
		mutate func(*authtest.Claims)
		method string
		url    string
		token  string
		ok     bool
	}{
		{"as issued", func(*authtest.Claims) {}, "POST", htu, "", true},
		{"wrong method", func(c *authtest.Claims) { c.HTM = "PUT" }, "POST", htu, "", false},
		{"wrong url", func(c *authtest.Claims) { c.HTU = "https://sync.example.org/docs" }, "POST", htu, "", false},
		{"wrong scheme", func(c *authtest.Claims) { c.HTU = "http://sync.example.org/enroll" }, "POST", htu, "", false},
		{"wrong host", func(c *authtest.Claims) { c.HTU = "https://evil.example/enroll" }, "POST", htu, "", false},
		{"old but inside the window", secs(-50), "POST", htu, "", true},
		{"too old", secs(-70), "POST", htu, "", false},
		{"new but inside the window", secs(50), "POST", htu, "", true},
		{"too new", secs(70), "POST", htu, "", false},
		{"no jti", func(c *authtest.Claims) { c.JTI = "" }, "POST", htu, "", false},
		{"no iat", func(c *authtest.Claims) { c.IAT = 0 }, "POST", htu, "", false},
		{"ath for the token", func(c *authtest.Claims) { c.ATH = authtest.ATH(token) }, "POST", htu, token, true},
		{"missing ath with a token", func(*authtest.Claims) {}, "POST", htu, token, false},
		{"ath of another token", func(c *authtest.Claims) { c.ATH = authtest.ATH("other") }, "POST", htu, token, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := claims()
			tt.mutate(&c)
			_, err := verifier(t).Verify(k.Proof(t, nil, c), tt.method, tt.url, tt.token)
			if (err == nil) != tt.ok {
				t.Errorf("err = %v, want ok = %v", err, tt.ok)
			}
		})
	}
}

func TestVerifyRefusesBadHeadersAndKeys(t *testing.T) {
	k := authtest.NewKey(t)
	jwk := k.JWK()
	with := func(key string, val any) map[string]any {
		j := map[string]any{}
		for a, b := range jwk {
			j[a] = b
		}
		if val == nil {
			delete(j, key)
		} else {
			j[key] = val
		}
		return map[string]any{"typ": "dpop+jwt", "alg": "ES256", "jwk": j}
	}
	zero := strings.Repeat("A", 43) // 32 zero bytes
	headers := map[string]map[string]any{
		"wrong typ":       {"typ": "JWT", "alg": "ES256", "jwk": jwk},
		"no typ":          {"alg": "ES256", "jwk": jwk},
		"alg none":        {"typ": "dpop+jwt", "alg": "none", "jwk": jwk},
		"alg HS256":       {"typ": "dpop+jwt", "alg": "HS256", "jwk": jwk},
		"alg ES384":       {"typ": "dpop+jwt", "alg": "ES384", "jwk": jwk},
		"no jwk":          {"typ": "dpop+jwt", "alg": "ES256"},
		"private part":    with("d", zero), // the library ignores it, so this is the check in Verify
		"wrong curve":     with("crv", "P-384"),
		"wrong kty":       with("kty", "RSA"),
		"short x":         with("x", "AAAA"),
		"point off curve": with("x", zero),
	}
	for name, h := range headers {
		t.Run(name, func(t *testing.T) {
			if _, err := verifier(t).Verify(k.Proof(t, h, claims()), "POST", htu, ""); err == nil {
				t.Error("accepted")
			}
		})
	}
}

func TestVerifyRefusesTamperingAndAnotherKey(t *testing.T) {
	k := authtest.NewKey(t)
	proof := k.Proof(t, nil, claims())
	parts := strings.Split(proof, ".")

	// A payload from another proof, under the first signature.
	c := claims()
	c.HTU = "https://sync.example.org/docs"
	other := strings.Split(k.Proof(t, nil, c), ".")
	if _, err := verifier(t).Verify(parts[0]+"."+other[1]+"."+parts[2], "POST", htu, ""); err == nil {
		t.Error("payload swapped under the old signature was accepted")
	}
	// A flipped bit in the signature.
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	sig[10] ^= 1
	if _, err := verifier(t).Verify(parts[0]+"."+parts[1]+"."+base64.RawURLEncoding.EncodeToString(sig), "POST", htu, ""); err == nil {
		t.Error("tampered signature was accepted")
	}
	// A signature that is not 64 bytes (a DER one would be).
	if _, err := verifier(t).Verify(parts[0]+"."+parts[1]+"."+base64.RawURLEncoding.EncodeToString(append(sig, 0)), "POST", htu, ""); err == nil {
		t.Error("65-byte signature was accepted")
	}
	// A proof signed by a key that is not the one in its header.
	mine := authtest.NewKey(t)
	header := map[string]any{"typ": "dpop+jwt", "alg": "ES256", "jwk": k.JWK()}
	if _, err := verifier(t).Verify(mine.Proof(t, header, claims()), "POST", htu, ""); err == nil {
		t.Error("proof signed by a different key than its jwk was accepted")
	}
	// A flattened JSON serialization is not a compact JWS.
	flattened := `{"protected":"` + parts[0] + `","payload":"` + parts[1] + `","signature":"` + parts[2] + `"}`
	for _, junk := range []string{"", "a.b", "a.b.c.d", "!!.!!.!!", flattened, strings.Repeat("a", maxProofBytes+1)} {
		if _, err := verifier(t).Verify(junk, "POST", htu, ""); err == nil {
			t.Errorf("%.40q was accepted", junk)
		}
	}
}

func TestVerifyRefusesAReplay(t *testing.T) {
	k := authtest.NewKey(t)
	v := verifier(t)
	proof := k.Proof(t, nil, claims())
	if _, err := v.Verify(proof, "POST", htu, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(proof, "POST", htu, ""); err == nil {
		t.Fatal("the same proof was accepted twice")
	}
	// The same jti from another key is another proof.
	if _, err := v.Verify(authtest.NewKey(t).Proof(t, nil, claims()), "POST", htu, ""); err != nil {
		t.Errorf("same jti, other key: %v", err)
	}
	// A rejected proof is not remembered: a mistake in the request does not use up the jti.
	c := claims()
	c.JTI = "j9"
	c.HTM = "PUT"
	_, _ = v.Verify(k.Proof(t, nil, c), "POST", htu, "")
	c.HTM = "POST"
	if _, err := v.Verify(k.Proof(t, nil, c), "POST", htu, ""); err != nil {
		t.Errorf("jti burned by a rejected proof: %v", err)
	}
}

// An entry is forgotten after the time it was given. In production that time is twice the proof window, so by then the proof
// itself is too old to be accepted; here it is short, to see the cache let go.
func TestReplayEntriesExpire(t *testing.T) {
	v := newVerifier(80 * time.Millisecond)
	t.Cleanup(v.Close)
	k := authtest.NewKey(t)
	proof := k.Proof(t, nil, claims())
	if _, err := v.Verify(proof, "POST", htu, ""); err != nil {
		t.Fatal(err)
	}
	if _, err := v.Verify(proof, "POST", htu, ""); err == nil {
		t.Fatal("replay accepted")
	}
	time.Sleep(200 * time.Millisecond)
	if _, err := v.Verify(proof, "POST", htu, ""); err != nil {
		t.Errorf("entry still remembered after its time: %v", err)
	}
}

func TestTokens(t *testing.T) {
	a, err := NewToken()
	if err != nil || len(a) != 43 {
		t.Fatalf("token %q, %v", a, err)
	}
	if b, _ := NewToken(); a == b {
		t.Error("two tokens are equal")
	}
	h := sha256.Sum256([]byte(a))
	if string(HashToken(a)) != string(h[:]) {
		t.Error("HashToken is not the SHA-256 of the string")
	}
	if id, _ := NewID(); len(id) != 32 || strings.Trim(id, "0123456789abcdef") != "" {
		t.Errorf("id %q", id)
	}
}
