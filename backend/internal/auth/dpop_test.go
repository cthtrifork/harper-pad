package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/auth/authtest"
)

const htu = "https://sync.example.org/enroll"

func verifier() *Verifier {
	v := NewVerifier()
	v.Now = func() time.Time { return authtest.Now }
	return v
}

func claims() authtest.Claims {
	return authtest.Claims{JTI: "j1", HTM: "POST", HTU: htu, IAT: authtest.Now.Unix()}
}

func TestVerifyAcceptsAGoodProof(t *testing.T) {
	k := authtest.NewKey(t)
	p, err := verifier().Verify(k.Proof(t, nil, claims()), "POST", htu, "")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(p.PublicKey, `{"crv":"P-256","kty":"EC","x":"`) {
		t.Errorf("not canonical: %s", p.PublicKey)
	}
	// The same key gives the same string in a later proof.
	c := claims()
	c.JTI = "j2"
	p2, err := verifier().Verify(k.Proof(t, nil, c), "POST", htu, "")
	if err != nil || p2.PublicKey != p.PublicKey {
		t.Errorf("second proof: %v, same key = %v", err, p2.PublicKey == p.PublicKey)
	}
	if other, _ := verifier().Verify(authtest.NewKey(t).Proof(t, nil, claims()), "POST", htu, ""); other.PublicKey == p.PublicKey {
		t.Error("two keys share a canonical form")
	}
}

func TestVerifyChecksTheClaims(t *testing.T) {
	k := authtest.NewKey(t)
	const token = "device-token"
	tests := []struct {
		name   string
		mutate func(*authtest.Claims)
		method string
		url    string
		token  string
		ok     bool
	}{
		{"query on htu is ignored", func(c *authtest.Claims) { c.HTU = htu + "?a=1#f" }, "POST", htu, "", true},
		{"wrong method", func(c *authtest.Claims) { c.HTM = "PUT" }, "POST", htu, "", false},
		{"wrong url", func(c *authtest.Claims) { c.HTU = "https://sync.example.org/docs" }, "POST", htu, "", false},
		{"wrong scheme", func(c *authtest.Claims) { c.HTU = "http://sync.example.org/enroll" }, "POST", htu, "", false},
		{"too old", func(c *authtest.Claims) { c.IAT -= 61 }, "POST", htu, "", false},
		{"too new", func(c *authtest.Claims) { c.IAT += 61 }, "POST", htu, "", false},
		{"edge of the window", func(c *authtest.Claims) { c.IAT -= 60 }, "POST", htu, "", true},
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
			if tt.name == "no iat" {
				c.IAT = 0 // an iat of 0 is far outside the window, which is the check being made
			}
			_, err := verifier().Verify(k.Proof(t, nil, c), tt.method, tt.url, tt.token)
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
		"alg none":        {"typ": "dpop+jwt", "alg": "none", "jwk": jwk},
		"alg HS256":       {"typ": "dpop+jwt", "alg": "HS256", "jwk": jwk},
		"no jwk":          {"typ": "dpop+jwt", "alg": "ES256"},
		"private part":    with("d", zero),
		"wrong curve":     with("crv", "P-384"),
		"wrong kty":       with("kty", "RSA"),
		"short x":         with("x", "AAAA"),
		"point off curve": with("x", zero),
	}
	for name, h := range headers {
		t.Run(name, func(t *testing.T) {
			if _, err := verifier().Verify(k.Proof(t, h, claims()), "POST", htu, ""); err == nil {
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
	if _, err := verifier().Verify(parts[0]+"."+other[1]+"."+parts[2], "POST", htu, ""); err == nil {
		t.Error("payload swapped under the old signature was accepted")
	}
	// A flipped bit in the signature.
	sig, _ := base64.RawURLEncoding.DecodeString(parts[2])
	sig[10] ^= 1
	if _, err := verifier().Verify(parts[0]+"."+parts[1]+"."+base64.RawURLEncoding.EncodeToString(sig), "POST", htu, ""); err == nil {
		t.Error("tampered signature was accepted")
	}
	// A signature that is not 64 bytes (a DER one would be).
	if _, err := verifier().Verify(parts[0]+"."+parts[1]+"."+base64.RawURLEncoding.EncodeToString(append(sig, 0)), "POST", htu, ""); err == nil {
		t.Error("65-byte signature was accepted")
	}
	// A proof signed by a key that is not the one in its header.
	mine := authtest.NewKey(t)
	header := map[string]any{"typ": "dpop+jwt", "alg": "ES256", "jwk": k.JWK()}
	if _, err := verifier().Verify(mine.Proof(t, header, claims()), "POST", htu, ""); err == nil {
		t.Error("proof signed by a different key than its jwk was accepted")
	}
	for _, junk := range []string{"", "a.b", "a.b.c.d", "!!.!!.!!", strings.Repeat("a", maxProofBytes+1)} {
		if _, err := verifier().Verify(junk, "POST", htu, ""); err == nil {
			t.Errorf("%q was accepted", junk)
		}
	}
}

func TestVerifyRefusesAReplay(t *testing.T) {
	k := authtest.NewKey(t)
	v := verifier()
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
	bad := k.Proof(t, nil, c)
	_, _ = v.Verify(bad, "POST", htu, "")
	c.HTM = "POST"
	if _, err := v.Verify(k.Proof(t, nil, c), "POST", htu, ""); err != nil {
		t.Errorf("jti burned by a rejected proof: %v", err)
	}
	// Later than twice the window the entry may be forgotten (the proof itself is then too old, so it is still refused).
	now := authtest.Now.Add(3 * proofWindow)
	v.Now = func() time.Time { return now }
	if _, err := v.Verify(proof, "POST", htu, ""); err == nil {
		t.Error("an old proof was accepted")
	}
}

func TestReplayCacheIsBounded(t *testing.T) {
	v := verifier()
	now := authtest.Now
	for i := range maxSeen {
		v.seen[strconv.Itoa(i)] = now.Add(time.Minute)
	}
	k := authtest.NewKey(t)
	if _, err := v.Verify(k.Proof(t, nil, claims()), "POST", htu, ""); err == nil {
		t.Error("accepted with a full cache")
	}
	// Entries that have expired make room.
	for key := range v.seen {
		v.seen[key] = now.Add(-time.Second)
	}
	c := claims()
	c.JTI = "fresh"
	if _, err := v.Verify(k.Proof(t, nil, c), "POST", htu, ""); err != nil {
		t.Errorf("not accepted after the cache expired: %v", err)
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

func TestVerifyIsCompactSerializationOnly(t *testing.T) {
	k := authtest.NewKey(t)
	parts := strings.Split(k.Proof(t, nil, claims()), ".")
	flattened := `{"protected":"` + parts[0] + `","payload":"` + parts[1] + `","signature":"` + parts[2] + `"}`
	if _, err := verifier().Verify(flattened, "POST", htu, ""); err == nil {
		t.Error("a flattened JSON serialization was accepted")
	}
}

// The base64url text of a coordinate has spare bits in its last character; a decoder that ignores them would let one key be
// written many ways. Either the proof is refused or it yields the same stored key as the clean spelling, never a second identity.
func TestOneKeyHasOneStoredForm(t *testing.T) {
	k := authtest.NewKey(t)
	clean, err := verifier().Verify(k.Proof(t, nil, claims()), "POST", htu, "")
	if err != nil {
		t.Fatal(err)
	}
	jwk := k.JWK()
	x := jwk["x"].(string)
	const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
	last := strings.IndexByte(alphabet, x[len(x)-1])
	for _, spare := range []int{1, 2, 3} { // the low two bits of the last character carry nothing
		alt := map[string]any{}
		for a, b := range jwk {
			alt[a] = b
		}
		alt["x"] = x[:len(x)-1] + string(alphabet[last&^3|(last+spare)&3])
		if alt["x"] == x {
			continue
		}
		c := claims()
		c.JTI = "spare" + string(rune('0'+spare))
		header := map[string]any{"typ": "dpop+jwt", "alg": "ES256", "jwk": alt}
		got, err := verifier().Verify(k.Proof(t, header, c), "POST", htu, "")
		// The signature was made with the real key, so verification can only succeed if the decoder read the same coordinate.
		if err == nil && got.PublicKey != clean.PublicKey {
			t.Errorf("spare bits %d: a second spelling of the key was accepted as %s", spare, got.PublicKey)
		}
	}
}
