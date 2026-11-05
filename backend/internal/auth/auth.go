package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
)

// NewToken returns a device token: 256 random bits as base64url without padding (43 characters), like an invite token.
func NewToken() (string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

// HashToken is what the database stores for a device or invite token: the SHA-256 of the token as it is written (the base64url
// string, not the bytes behind it). A fast hash is enough for a secret with 256 bits of entropy. The admin service hashes invite
// tokens the same way.
func HashToken(token string) []byte {
	h := sha256.Sum256([]byte(token))
	return h[:]
}

// NewID returns a random device id: 128 bits as 32 lower-case hex characters.
func NewID() (string, error) {
	raw := make([]byte, 16)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	const hexdigits = "0123456789abcdef"
	out := make([]byte, 32)
	for i, b := range raw {
		out[2*i], out[2*i+1] = hexdigits[b>>4], hexdigits[b&15]
	}
	return string(out), nil
}
