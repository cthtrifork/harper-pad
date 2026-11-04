package admin

import (
	"context"
	"errors"
	"time"
)

// Errors a Store returns. Handlers map them to status codes; anything else is a 500 whose cause goes to the log only.
var (
	// ErrNotFound means the device or invite does not exist (any more).
	ErrNotFound = errors.New("not found")
	// ErrInvalid means the input broke a rule (an empty or over-long device name).
	ErrInvalid = errors.New("invalid input")
)

// Device is a row of the devices table as the admin UI sees it. It never carries the token hash or the DPoP key: the admin
// role cannot read them anyway.
type Device struct {
	ID        string
	Name      string
	UserAgent string
	CreatedAt time.Time
	LastSeen  time.Time // zero when the device never synced
}

// Invite is a pending enrollment URL. ID is an opaque handle for cancelling it (not the token, and not the token hash).
type Invite struct {
	ID         string
	DeviceName string
	ExpiresAt  time.Time
}

// Account is a client account. v1 has exactly one.
type Account struct {
	ID   int64
	Name string
}

// Store is everything the admin UI needs from the database, and matches the grants of the harper_admin role: invites
// (insert, select, delete), devices (select, rename, delete), clients (select). There is no way to read a note.
type Store interface {
	Accounts(ctx context.Context) ([]Account, error)
	Devices(ctx context.Context) ([]Device, error)
	// RenameDevice returns the updated device, or ErrNotFound.
	RenameDevice(ctx context.Context, id, name string) (Device, error)
	// RevokeDevice deletes the device's row, or returns ErrNotFound.
	RevokeDevice(ctx context.Context, id string) error
	// PendingInvites lists invites that are neither spent nor expired at now.
	PendingInvites(ctx context.Context, now time.Time) ([]Invite, error)
	// CreateInvite makes a single-use invite for the only account, valid for ttl. It returns the plaintext token, which the
	// implementation stores only as a SHA-256 hash and which is never available again.
	CreateInvite(ctx context.Context, deviceName string, ttl time.Duration) (token string, inv Invite, err error)
	// CancelInvite deletes a pending invite, or returns ErrNotFound.
	CancelInvite(ctx context.Context, id string) error
}
