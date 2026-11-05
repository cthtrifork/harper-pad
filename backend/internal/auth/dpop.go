package auth

import (
	"bytes"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"math/big"
	"net/url"
	"strings"
	"sync"
	"time"
)

// ErrInvalidProof is returned for every proof that fails a check. The cause is deliberately not in the error: the HTTP layer
// answers a plain 401 and nothing outside the process learns which check failed.
var ErrInvalidProof = errors.New("invalid DPoP proof")

const (
	// proofWindow is how far a proof's iat may be from the server's clock, in either direction (docs/sync.md: about 60 seconds).
	proofWindow = 60 * time.Second
	// maxProofBytes bounds the header value before anything is parsed.
	maxProofBytes = 2048
	// maxSeen bounds the replay cache. Above it new proofs are refused rather than the memory growing; the ingress rate limit keeps
	// real traffic far below.
	maxSeen = 100_000
)

// Verifier checks DPoP proofs (RFC 9449 section 4.3) and remembers the jti of every accepted proof for as long as it could still be
// replayed. The cache is in memory, which is enough at one replica (the sync Deployment uses the Recreate strategy for this).
type Verifier struct {
	// Now is the clock; tests replace it.
	Now func() time.Time

	mu   sync.Mutex
	seen map[string]time.Time // thumbprint + "." + jti -> when it may be forgotten
}

// NewVerifier returns a Verifier that uses the real clock.
func NewVerifier() *Verifier { return &Verifier{Now: time.Now, seen: map[string]time.Time{}} }

// Proof is what a verified proof tells the caller.
type Proof struct {
	// PublicKey is the proof's key as a canonical JWK: {"crv":"P-256","kty":"EC","x":"...","y":"..."}, members in that order and
	// nothing else. Two proofs from the same key give the same string, so the stored key is compared with ==, which is the same as
	// comparing JWK thumbprints (RFC 7638).
	PublicKey string
}

// Verify checks a proof header value for a request. method and htu are the request's method and URL as the server sees them
// (the scheme and host come from configuration, never from headers); a query or fragment in the proof's htu is ignored, as the RFC
// says. accessToken is the device token presented in Authorization, or empty for /enroll, where there is none yet; when it is set
// the proof's ath must be the base64url SHA-256 of it.
func (v *Verifier) Verify(header, method, htu, accessToken string) (Proof, error) {
	if len(header) == 0 || len(header) > maxProofBytes {
		return Proof{}, ErrInvalidProof
	}
	parts := strings.Split(header, ".")
	if len(parts) != 3 {
		return Proof{}, ErrInvalidProof
	}
	hdrJSON, err1 := b64(parts[0])
	payJSON, err2 := b64(parts[1])
	sig, err3 := b64(parts[2])
	if err1 != nil || err2 != nil || err3 != nil {
		return Proof{}, ErrInvalidProof
	}

	var h struct {
		Typ string          `json:"typ"`
		Alg string          `json:"alg"`
		JWK json.RawMessage `json:"jwk"`
	}
	if err := strictJSON(hdrJSON, &h); err != nil || h.Typ != "dpop+jwt" || h.Alg != "ES256" {
		return Proof{}, ErrInvalidProof
	}
	pub, canonical, err := parseJWK(h.JWK)
	if err != nil {
		return Proof{}, ErrInvalidProof
	}

	// ES256 in a JWS is the raw r||s, 64 bytes (what WebCrypto produces). A DER signature has another length and is refused.
	if len(sig) != 64 {
		return Proof{}, ErrInvalidProof
	}
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	if !ecdsa.Verify(pub, digest[:], new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])) {
		return Proof{}, ErrInvalidProof
	}

	var p struct {
		JTI string `json:"jti"`
		HTM string `json:"htm"`
		HTU string `json:"htu"`
		IAT *int64 `json:"iat"`
		ATH string `json:"ath"`
	}
	if err := strictJSON(payJSON, &p); err != nil || p.JTI == "" || len(p.JTI) > 128 || p.IAT == nil {
		return Proof{}, ErrInvalidProof
	}
	if p.HTM != method || !sameURL(p.HTU, htu) {
		return Proof{}, ErrInvalidProof
	}
	now := v.Now()
	if d := now.Sub(time.Unix(*p.IAT, 0)); d > proofWindow || d < -proofWindow {
		return Proof{}, ErrInvalidProof
	}
	if accessToken != "" {
		ath := sha256.Sum256([]byte(accessToken))
		if p.ATH != base64.RawURLEncoding.EncodeToString(ath[:]) {
			return Proof{}, ErrInvalidProof
		}
	}

	// Last: remember the jti only for a proof that passed everything else, so a bad request cannot fill the cache.
	if !v.remember(canonical+"."+p.JTI, now) {
		return Proof{}, ErrInvalidProof
	}
	return Proof{PublicKey: canonical}, nil
}

// remember records a jti and reports false when it was already seen, or when the cache is full.
func (v *Verifier) remember(key string, now time.Time) bool {
	v.mu.Lock()
	defer v.mu.Unlock()
	if until, ok := v.seen[key]; ok && until.After(now) {
		return false
	}
	if len(v.seen) >= maxSeen/2 { // prune only when it is getting large: pruning walks the whole map
		for k, until := range v.seen {
			if !until.After(now) {
				delete(v.seen, k)
			}
		}
		if len(v.seen) >= maxSeen {
			return false
		}
	}
	// A proof is accepted for proofWindow after its iat and before it, so it must be remembered for twice the window.
	v.seen[key] = now.Add(2 * proofWindow)
	return true
}

func b64(s string) ([]byte, error) { return base64.RawURLEncoding.DecodeString(s) }

// strictJSON decodes one JSON object and refuses trailing data.
func strictJSON(data []byte, v any) error {
	dec := json.NewDecoder(bytes.NewReader(data))
	if err := dec.Decode(v); err != nil {
		return err
	}
	if dec.More() {
		return errors.New("trailing data")
	}
	return nil
}

// parseJWK accepts a public P-256 key in JWK form and nothing else: kty EC, crv P-256, 32-byte x and y that are a point on the
// curve, and no private part ("d"). It returns the key and its canonical JWK string.
func parseJWK(raw json.RawMessage) (*ecdsa.PublicKey, string, error) {
	var k map[string]any
	if err := strictJSON(raw, &k); err != nil {
		return nil, "", err
	}
	if _, private := k["d"]; private || k["kty"] != "EC" || k["crv"] != "P-256" {
		return nil, "", errors.New("not a public P-256 JWK")
	}
	xs, _ := k["x"].(string)
	ys, _ := k["y"].(string)
	x, err1 := b64(xs)
	y, err2 := b64(ys)
	if err1 != nil || err2 != nil || len(x) != 32 || len(y) != 32 {
		return nil, "", errors.New("bad coordinates")
	}
	// crypto/ecdh checks that the point is on the curve (and not the identity).
	point := append([]byte{4}, append(x, y...)...)
	if _, err := ecdh.P256().NewPublicKey(point); err != nil {
		return nil, "", err
	}
	pub := &ecdsa.PublicKey{Curve: elliptic.P256(), X: new(big.Int).SetBytes(x), Y: new(big.Int).SetBytes(y)}
	// Re-encoded from the bytes: the decoder accepts non-zero padding bits, so the client's text is not trusted to be canonical.
	canonical := `{"crv":"P-256","kty":"EC","x":"` + base64.RawURLEncoding.EncodeToString(x) +
		`","y":"` + base64.RawURLEncoding.EncodeToString(y) + `"}`
	return pub, canonical, nil
}

// sameURL compares a proof's htu with the request URL, ignoring the query and the fragment of the proof's value.
func sameURL(proofHTU, want string) bool {
	u, err := url.Parse(proofHTU)
	if err != nil {
		return false
	}
	u.RawQuery, u.Fragment, u.RawFragment = "", "", ""
	return u.String() == want
}
