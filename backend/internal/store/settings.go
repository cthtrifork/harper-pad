package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrSettingNotFound is returned by GetSetting for a key the account has not stored yet.
var ErrSettingNotFound = errors.New("setting not found")

// ErrSettingConflict is returned by PutSetting when the stored version is not the base the writer saw. PutSetting also returns the
// stored row (an empty Setting, Key "", when there is none).
var ErrSettingConflict = errors.New("setting changed")

// ErrSettingTooLarge is returned by PutSetting when the database's CHECK on settings.data refuses the text.
var ErrSettingTooLarge = errors.New("setting too large")

// MaxSettingData is the limit of the CHECK on settings.data (migration 0002), in bytes.
const MaxSettingData = 1 << 20

// Setting is one synced setting: its key ("words" or "ignored"), a compare-and-set version and the device-made document.
type Setting struct {
	Key     string
	Version int64
	Data    string
}

func settingRow(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, clientID int64, key, lock string) (Setting, error) {
	s := Setting{Key: key}
	err := q.QueryRow(ctx, `SELECT version, data FROM settings WHERE client_id = $1 AND key = $2 `+lock, clientID, key).Scan(&s.Version, &s.Data)
	return s, err
}

// GetSetting returns one setting of the client account.
func (s *Sync) GetSetting(ctx context.Context, clientID int64, key string) (Setting, error) {
	v, err := settingRow(ctx, s.db, clientID, key, "")
	if errors.Is(err, pgx.ErrNoRows) {
		return Setting{}, ErrSettingNotFound
	}
	return v, err
}

// PutSetting is compare-and-set like PutDoc: in one transaction it locks the row, checks that its version equals base (0 for a key
// the server does not have, which is inserted) and stores data with version + 1. On a mismatch nothing changes and the stored row
// comes back with ErrSettingConflict.
func (s *Sync) PutSetting(ctx context.Context, clientID int64, key string, base int64, data string) (Setting, error) {
	tooLarge := func(err error) error {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" && pgErr.ConstraintName == "settings_data_check" {
			return ErrSettingTooLarge
		}
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Setting{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	cur, err := settingRow(ctx, tx, clientID, key, "FOR UPDATE")
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if base != 0 {
			return Setting{}, ErrSettingConflict
		}
		tag, err := tx.Exec(ctx, `INSERT INTO settings (client_id, key, version, data) VALUES ($1, $2, 1, $3) ON CONFLICT DO NOTHING`, clientID, key, data)
		if err != nil {
			return Setting{}, tooLarge(err)
		}
		if tag.RowsAffected() == 0 { // lost a race with another first write
			if cur, err = settingRow(ctx, tx, clientID, key, ""); err != nil {
				return Setting{}, err
			}
			return cur, ErrSettingConflict
		}
		return Setting{Key: key, Version: 1, Data: data}, tx.Commit(ctx)
	case err != nil:
		return Setting{}, err
	}
	if cur.Version != base {
		return cur, ErrSettingConflict
	}
	if _, err := tx.Exec(ctx, `UPDATE settings SET version = $3, data = $4 WHERE client_id = $1 AND key = $2`, clientID, key, base+1, data); err != nil {
		return Setting{}, tooLarge(err)
	}
	return Setting{Key: key, Version: base + 1, Data: data}, tx.Commit(ctx)
}
