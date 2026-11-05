package auth

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/url"
	"sync"
	"time"

	"github.com/go-jose/go-jose/v4"
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
//
// The JWS and JWK work (parsing, the algorithm allow-list, the key checks and the signature) is go-jose's. What is checked here is
// what no library does for this design, which has no OAuth server around the proof: the claims against the request, the token
// hash, and replay.
type Verifier struct {
	// Now is the clock; tests replace it.
	Now func() time.Time

	mu   sync.Mutex
	seen map[string]time.Time // key + "." + jti -> when it may be forgotten
}

// NewVerifier returns a Verifier that uses the real clock.
func NewVerifier() *Verifier { return &Verifier{Now: time.Now, seen: map[string]time.Time{}} }

// Proof is what a verified proof tells the caller.
type Proof struct {
	// PublicKey is the proof's key as a canonical JWK: {"crv":"P-256","kty":"EC","x":"...","y":"..."}, members in that order and
	// nothing else, the coordinates as 32 bytes in base64url. Two proofs from the same key give the same string, so the stored key
	// is compared with ==, which is the same as comparing JWK thumbprints (RFC 7638).
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
	// Compact serialization only, and only ES256: a proof that names another algorithm (including "none" and the HMAC ones that
	// are used in key-confusion attacks) is refused before any key is looked at.
	jws, err := jose.ParseSignedCompact(header, []jose.SignatureAlgorithm{jose.ES256})
	if err != nil || len(jws.Signatures) != 1 {
		return Proof{}, ErrInvalidProof
	}
	h := jws.Signatures[0].Header
	if typ, _ := h.ExtraHeaders[jose.HeaderType].(string); typ != "dpop+jwt" {
		return Proof{}, ErrInvalidProof
	}
	// The key is the one in the proof's own header: a public P-256 key (go-jose has checked that it is a valid point and has no
	// private part by Valid and IsPublic).
	jwk := h.JSONWebKey
	if jwk == nil || !jwk.Valid() || !jwk.IsPublic() {
		return Proof{}, ErrInvalidProof
	}
	pub, ok := jwk.Key.(*ecdsa.PublicKey)
	if !ok || pub.Curve != elliptic.P256() {
		return Proof{}, ErrInvalidProof
	}
	payload, err := jws.Verify(jwk)
	if err != nil {
		return Proof{}, ErrInvalidProof
	}
	canonical := canonicalJWK(pub)

	var p struct {
		JTI string `json:"jti"`
		HTM string `json:"htm"`
		HTU string `json:"htu"`
		IAT *int64 `json:"iat"`
		ATH string `json:"ath"`
	}
	if err := strictJSON(payload, &p); err != nil || p.JTI == "" || len(p.JTI) > 128 || p.IAT == nil {
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

// canonicalJWK writes a P-256 public key in the one form this server stores and compares: fixed member order, 32-byte padded
// coordinates, nothing else. It is built from the key, not copied from the client's text, so one key has one string.
func canonicalJWK(pub *ecdsa.PublicKey) string {
	x := make([]byte, 32)
	y := make([]byte, 32)
	pub.X.FillBytes(x)
	pub.Y.FillBytes(y)
	return `{"crv":"P-256","kty":"EC","x":"` + base64.RawURLEncoding.EncodeToString(x) +
		`","y":"` + base64.RawURLEncoding.EncodeToString(y) + `"}`
}

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

// sameURL compares a proof's htu with the request URL, ignoring the query and the fragment of the proof's value.
func sameURL(proofHTU, want string) bool {
	u, err := url.Parse(proofHTU)
	if err != nil {
		return false
	}
	u.RawQuery, u.Fragment, u.RawFragment = "", "", ""
	return u.String() == want
}
