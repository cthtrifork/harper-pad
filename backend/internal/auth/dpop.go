package auth

import (
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"net/url"
	"time"

	"github.com/AxisCommunications/go-dpop"
	"github.com/jellydator/ttlcache/v3"
)

// ErrInvalidProof is returned for every proof that fails a check. The cause is deliberately not in the error: the HTTP layer
// answers a 401 that is the same for every failure and nothing outside the process learns which check failed.
var ErrInvalidProof = errors.New("invalid DPoP proof")

const (
	// proofWindow is how far a proof's iat may be from the server's clock, in either direction (docs/sync.md: about 60 seconds).
	proofWindow = 60 * time.Second
	// maxProofBytes bounds the header value before anything is parsed.
	maxProofBytes = 2048
	// maxSeen bounds the replay cache. When it is full the oldest entries are dropped to make room.
	maxSeen = 100_000
)

// Verifier checks DPoP proofs and remembers every accepted proof's jti for as long as it could still be replayed.
//
// The proof itself is checked by github.com/AxisCommunications/go-dpop (on golang-jwt): the compact JWS, `typ`, the header `jwk`,
// the signature, `htm`, `htu`, `iat` within the window and the jti and iat being present, following RFC 9449 section 4.3. The
// replay cache is a ttlcache. What is left here is what neither does for this design, which has no OAuth server around the
// proof: ES256 only, no private key in the jwk, the hash of the device token, and the order of those checks.
type Verifier struct {
	seen *ttlcache.Cache[string, struct{}]
}

// NewVerifier returns a Verifier. Call Close when it is no longer needed: the cache runs a goroutine that removes expired entries.
func NewVerifier() *Verifier { return newVerifier(2 * proofWindow) }

// newVerifier takes the time a jti is remembered, so a test can see an entry expire. A proof is accepted for proofWindow after its
// iat and before it, so it must be remembered for twice the window.
func newVerifier(ttl time.Duration) *Verifier {
	c := ttlcache.New(ttlcache.WithTTL[string, struct{}](ttl), ttlcache.WithCapacity[string, struct{}](maxSeen))
	go c.Start()
	return &Verifier{seen: c}
}

// Close stops the cache's cleaning goroutine.
func (v *Verifier) Close() { v.seen.Stop() }

// Proof is what a verified proof tells the caller.
type Proof struct {
	// KeyThumbprint is the RFC 7638 SHA-256 thumbprint of the proof's key, base64url. It is what the database stores for a device at
	// enrollment and what every later proof must equal. It is computed from the decoded key, so one key has one thumbprint however
	// its coordinates are spelled (TestARespelledKeyIsTheSameKey).
	KeyThumbprint string
}

// Verify checks a proof header value for a request. method and htu are the request's method and URL as the server sees them
// (the scheme and host come from configuration, never from headers, and htu has no query). accessToken is the device token
// presented in Authorization, or empty for /enroll, where there is none yet; when it is set the proof's ath must be the base64url
// SHA-256 of it.
func (v *Verifier) Verify(header, method, htu, accessToken string) (Proof, error) {
	if len(header) == 0 || len(header) > maxProofBytes {
		return Proof{}, ErrInvalidProof
	}
	u, err := url.Parse(htu)
	if err != nil {
		return Proof{}, ErrInvalidProof
	}
	window := proofWindow
	p, err := dpop.Parse(header, dpop.HTTPVerb(method), u, dpop.ParseOptions{AllowedProofAge: &window, TimeWindow: &window})
	if err != nil {
		return Proof{}, ErrInvalidProof
	}
	claims, ok := p.Claims.(*dpop.ProofTokenClaims)
	// ES256 only: the library takes whatever algorithm and key type the proof presents.
	if !ok || p.Method.Alg() != "ES256" {
		return Proof{}, ErrInvalidProof
	}
	// RFC 9449 section 4.3, item 7: the jwk must not hold a private key (the library reads only the public members).
	if jwk, _ := p.Header["jwk"].(map[string]any); jwk["d"] != nil {
		return Proof{}, ErrInvalidProof
	}
	if accessToken != "" {
		ath := sha256.Sum256([]byte(accessToken))
		if claims.AccessTokenHash != base64.RawURLEncoding.EncodeToString(ath[:]) {
			return Proof{}, ErrInvalidProof
		}
	}
	// Last: remember the jti only for a proof that passed everything else, so a bad request cannot fill the cache.
	if _, replayed := v.seen.GetOrSet(p.PublicKey()+"."+claims.ID, struct{}{}); replayed {
		return Proof{}, ErrInvalidProof
	}
	return Proof{KeyThumbprint: p.PublicKey()}, nil
}
