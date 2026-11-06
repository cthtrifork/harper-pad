package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrSettingNotFound is returned by GetSetting for an account that has not stored its settings yet.
var ErrSettingNotFound = errors.New("setting not found")

// ErrSettingConflict is returned by PutSetting when the stored version is not the base the writer saw. PutSetting also returns the
// stored row (an empty Setting, Version 0, when there is none).
var ErrSettingConflict = errors.New("setting changed")

// ErrSettingTooLarge is returned by PutSetting when the database's size CHECK on the lists refuses them.
var ErrSettingTooLarge = errors.New("setting too large")

// MaxSettingData is the limit of the CHECK on the size of settings.words and settings.ignored together (migration 0002), in bytes of JSON.
const MaxSettingData = 256 << 10

// Setting is the synced settings of an account: a compare-and-set version, the dictionary and the decimal hashes of the ignore list.
type Setting struct {
	Version int64
	Words   []string
	Ignored []string
}

// lists makes sure both lists are arrays: a nil slice would be stored as JSON null, which the table refuses.
func (s Setting) lists() (words, ignored []string) {
	words, ignored = s.Words, s.Ignored
	if words == nil {
		words = []string{}
	}
	if ignored == nil {
		ignored = []string{}
	}
	return words, ignored
}

func settingRow(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, clientID int64, lock string) (Setting, error) {
	var s Setting
	err := q.QueryRow(ctx, `SELECT version, words, ignored FROM settings WHERE client_id = $1 `+lock, clientID).Scan(&s.Version, &s.Words, &s.Ignored)
	return s, err
}

// GetSetting returns the settings of the client account.
func (s *Sync) GetSetting(ctx context.Context, clientID int64) (Setting, error) {
	v, err := settingRow(ctx, s.db, clientID, "")
	if errors.Is(err, pgx.ErrNoRows) {
		return Setting{}, ErrSettingNotFound
	}
	return v, err
}

// PutSetting is compare-and-set like PutDoc: in one transaction it locks the row, checks that its version equals base (0 for an
// account the server has nothing for, which is inserted) and stores the lists with version + 1. On a mismatch nothing changes and the
// stored row comes back with ErrSettingConflict.
func (s *Sync) PutSetting(ctx context.Context, clientID int64, base int64, w Setting) (Setting, error) {
	words, ignored := w.lists()
	tooLarge := func(err error) error {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23514" && pgErr.ConstraintName == "settings_size" {
			return ErrSettingTooLarge
		}
		return err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Setting{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	cur, err := settingRow(ctx, tx, clientID, "FOR UPDATE")
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if base != 0 {
			return Setting{}, ErrSettingConflict
		}
		tag, err := tx.Exec(ctx, `INSERT INTO settings (client_id, version, words, ignored) VALUES ($1, 1, $2, $3) ON CONFLICT DO NOTHING`, clientID, words, ignored)
		if err != nil {
			return Setting{}, tooLarge(err)
		}
		if tag.RowsAffected() == 0 { // lost a race with another first write
			if cur, err = settingRow(ctx, tx, clientID, ""); err != nil {
				return Setting{}, err
			}
			return cur, ErrSettingConflict
		}
		return Setting{Version: 1, Words: words, Ignored: ignored}, tx.Commit(ctx)
	case err != nil:
		return Setting{}, err
	}
	if cur.Version != base {
		return cur, ErrSettingConflict
	}
	if _, err := tx.Exec(ctx, `UPDATE settings SET version = $2, words = $3, ignored = $4 WHERE client_id = $1`, clientID, base+1, words, ignored); err != nil {
		return Setting{}, tooLarge(err)
	}
	return Setting{Version: base + 1, Words: words, Ignored: ignored}, tx.Commit(ctx)
}
