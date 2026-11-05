package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrInvalidInvite is returned for an invite that does not exist, is spent or has expired. The three are not told apart, so the
// caller cannot be used to find out which tokens exist.
var ErrInvalidInvite = errors.New("invalid invite")

// ErrUnknownToken is returned when no device has the presented token (never enrolled, or revoked).
var ErrUnknownToken = errors.New("unknown device token")

// lastSeenEvery is how stale last_seen may get before a request writes it again: one write a minute per device at most, so a busy
// Sync all is not a write per request.
const lastSeenEvery = time.Minute

// Sync is the PostgreSQL store of harper-pad-sync. It runs as harper_sync, the owner of the tables.
type Sync struct {
	db  *pgxpool.Pool
	now func() time.Time
}

// NewSync returns the sync store on db.
func NewSync(db *pgxpool.Pool) *Sync { return &Sync{db: db, now: time.Now} }

// Device is what a request needs to know about the device behind a token.
type Device struct {
	ID        string
	ClientID  int64
	PublicKey string // the canonical JWK the device enrolled with (auth.Proof.PublicKey)
}

// Enroll spends the invite and creates the device in one transaction: if the device cannot be written the invite is not spent. The
// spend is a single UPDATE, so two devices presenting the same invite cannot both win. The device is bound to the invite's client
// account, and named after the invite (typed in the admin UI) or, when that is empty, deviceName.
func (s *Sync) Enroll(ctx context.Context, inviteHash []byte, deviceID, deviceName, userAgent, publicKey string, tokenHash []byte) error {
	now := s.now().UnixMilli()
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var clientID int64
	var inviteName string
	err = tx.QueryRow(ctx, `
		UPDATE invites SET used_at = $2
		WHERE token_hash = $1 AND used_at IS NULL AND expires_at > $2
		RETURNING client_id, device_name`, inviteHash, now).Scan(&clientID, &inviteName)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidInvite
	}
	if err != nil {
		return err
	}
	if inviteName != "" {
		deviceName = inviteName
	}
	if deviceName == "" {
		deviceName = "Device"
	}
	if _, err := tx.Exec(ctx, `
		INSERT INTO devices (id, client_id, name, user_agent, token_hash, public_key, created_at, last_seen)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
		deviceID, clientID, deviceName, userAgent, tokenHash, publicKey, now); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// DeviceByToken finds the device that owns a token hash, and records that it was seen (at most once a minute). The client account
// comes from this row and from nowhere else: no request carries one.
func (s *Sync) DeviceByToken(ctx context.Context, tokenHash []byte) (Device, error) {
	now := s.now().UnixMilli()
	var d Device
	err := s.db.QueryRow(ctx, `
		WITH d AS (SELECT id, client_id, public_key, last_seen FROM devices WHERE token_hash = $1),
		     u AS (UPDATE devices SET last_seen = $2 WHERE token_hash = $1 AND last_seen < $3 RETURNING id)
		SELECT id, client_id, public_key FROM d`,
		tokenHash, now, now-lastSeenEvery.Milliseconds()).Scan(&d.ID, &d.ClientID, &d.PublicKey)
	if errors.Is(err, pgx.ErrNoRows) {
		return Device{}, ErrUnknownToken
	}
	return d, err
}

// PurgeInvites deletes invites that expired more than a day ago, spent or not (the admin UI shows pending ones only, and a spent
// invite's row has no use after its device exists). It returns how many were removed.
func (s *Sync) PurgeInvites(ctx context.Context) (int64, error) {
	tag, err := s.db.Exec(ctx, `DELETE FROM invites WHERE expires_at < $1`, s.now().Add(-24*time.Hour).UnixMilli())
	return tag.RowsAffected(), err
}
