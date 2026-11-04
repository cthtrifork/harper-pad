package store

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/cthtrifork/harper-pad/backend/internal/admin"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Admin is the PostgreSQL implementation of admin.Store. It runs as the harper_admin role, so the database itself refuses
// anything beyond the grants in migrations/0001_init.sql: it can list, rename and delete devices, create, list and delete
// invites, and read the client accounts. It cannot read a note.
type Admin struct {
	db  *pgxpool.Pool
	now func() time.Time
}

var _ admin.Store = (*Admin)(nil)

// NewAdmin returns the admin store on db.
func NewAdmin(db *pgxpool.Pool) *Admin { return &Admin{db: db, now: time.Now} }

func (a *Admin) Accounts(ctx context.Context) ([]admin.Account, error) {
	rows, err := a.db.Query(ctx, `SELECT id, name FROM clients ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []admin.Account
	for rows.Next() {
		var c admin.Account
		if err := rows.Scan(&c.ID, &c.Name); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

const deviceColumns = `id, name, user_agent, created_at, last_seen`

func scanDevice(row pgx.Row) (admin.Device, error) {
	var d admin.Device
	var created, seen int64
	if err := row.Scan(&d.ID, &d.Name, &d.UserAgent, &created, &seen); err != nil {
		return admin.Device{}, err
	}
	d.CreatedAt = time.UnixMilli(created)
	if seen > 0 {
		d.LastSeen = time.UnixMilli(seen)
	}
	return d, nil
}

func (a *Admin) Devices(ctx context.Context) ([]admin.Device, error) {
	rows, err := a.db.Query(ctx, `SELECT `+deviceColumns+` FROM devices ORDER BY created_at, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []admin.Device
	for rows.Next() {
		d, err := scanDevice(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (a *Admin) RenameDevice(ctx context.Context, id, name string) (admin.Device, error) {
	d, err := scanDevice(a.db.QueryRow(ctx, `UPDATE devices SET name = $2 WHERE id = $1 RETURNING `+deviceColumns, id, name))
	if errors.Is(err, pgx.ErrNoRows) {
		return admin.Device{}, admin.ErrNotFound
	}
	return d, err
}

func (a *Admin) RevokeDevice(ctx context.Context, id string) error {
	tag, err := a.db.Exec(ctx, `DELETE FROM devices WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return admin.ErrNotFound
	}
	return nil
}

// An invite's handle in the page is the SHA-256 of its token hash: it identifies the row for Cancel without being the hash
// itself, which is what the sync service looks the token up by.
func inviteID(tokenHash []byte) string {
	h := sha256.Sum256(tokenHash)
	return hex.EncodeToString(h[:])
}

func (a *Admin) PendingInvites(ctx context.Context, now time.Time) ([]admin.Invite, error) {
	rows, err := a.db.Query(ctx,
		`SELECT token_hash, device_name, expires_at FROM invites WHERE used_at IS NULL AND expires_at > $1 ORDER BY created_at, token_hash`,
		now.UnixMilli())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []admin.Invite
	for rows.Next() {
		var hash []byte
		var inv admin.Invite
		var expires int64
		if err := rows.Scan(&hash, &inv.DeviceName, &expires); err != nil {
			return nil, err
		}
		inv.ID, inv.ExpiresAt = inviteID(hash), time.UnixMilli(expires)
		out = append(out, inv)
	}
	return out, rows.Err()
}

// CreateInvite inserts an invite for the one client account. The token is 256 random bits, base64url (the URL fragment the
// device pastes), and only its SHA-256 is stored. With zero or several accounts it fails rather than guess which one to use.
func (a *Admin) CreateInvite(ctx context.Context, deviceName string, ttl time.Duration) (string, admin.Invite, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", admin.Invite{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(raw)
	hash := sha256.Sum256([]byte(token))
	now := a.now()
	expires := now.Add(ttl)

	// One statement: the account is chosen only when there is exactly one, so a second account cannot slip in between a check
	// and the insert.
	tag, err := a.db.Exec(ctx, `
		INSERT INTO invites (token_hash, client_id, device_name, created_at, expires_at)
		SELECT $1, id, $2, $3, $4 FROM clients WHERE (SELECT count(*) FROM clients) = 1`,
		hash[:], deviceName, now.UnixMilli(), expires.UnixMilli())
	if err != nil {
		return "", admin.Invite{}, err
	}
	if tag.RowsAffected() != 1 {
		return "", admin.Invite{}, fmt.Errorf("expected exactly one client account: %w", admin.ErrInvalid)
	}
	return token, admin.Invite{ID: inviteID(hash[:]), DeviceName: deviceName, ExpiresAt: time.UnixMilli(expires.UnixMilli())}, nil
}

func (a *Admin) CancelInvite(ctx context.Context, id string) error {
	raw, err := hex.DecodeString(id)
	if err != nil || len(raw) != sha256.Size {
		return admin.ErrNotFound
	}
	tag, err := a.db.Exec(ctx, `DELETE FROM invites WHERE used_at IS NULL AND sha256(token_hash) = $1`, raw)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return admin.ErrNotFound
	}
	return nil
}
