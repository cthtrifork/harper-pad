// Package auth creates and hashes device tokens, handles the invite lifecycle, and checks the DPoP proof that comes with every
// request (RFC 9449: an ES256 JWT with htm, htu, iat, jti and ath, whose key must be the one stored on the token's device row,
// compared by JWK thumbprint). The token is opaque, so the binding to the key lives in the database. See docs/sync.md,
// "Authentication" and "Limiting the damage of a stolen device".
package auth
