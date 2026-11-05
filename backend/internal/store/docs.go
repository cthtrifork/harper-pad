package store

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// ErrDocNotFound is returned by GetDoc for an id the client account has no row for.
var ErrDocNotFound = errors.New("doc not found")

// ErrConflict is returned by PutDoc when the stored draft is not the state the writer saw. PutDoc also returns the stored row (an
// empty Doc, ID "", when there is none) so the caller can hand it back as the 409.
var ErrConflict = errors.New("doc changed")

// ErrTooLarge is returned by PutDoc when the database's CHECK on docs.data refuses the text. That CHECK is the one size limit of a
// draft on the server; MaxDocData only sizes the request body cap in front of it and is tested against it.
var ErrTooLarge = errors.New("draft too large")

// MaxDocData is the limit of the CHECK on docs.data (migration 0001), in bytes.
const MaxDocData = 2 << 20

// docWriteErr turns the database's refusal of too much text into ErrTooLarge and leaves every other error as it is.
func docWriteErr(err error) error {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23514" && pgErr.ConstraintName == "docs_data_check" { // check_violation
		return ErrTooLarge
	}
	return err
}

// Doc is one draft row. Times are Unix milliseconds set by the device that saved it.
type Doc struct {
	ID        string
	Version   int64
	CreatedAt int64
	UpdatedAt int64
	Deleted   bool
	Data      string
}

// DocState is a draft's state without its text, as GET /docs lists it.
type DocState struct {
	ID        string
	Version   int64
	UpdatedAt int64
	Deleted   bool
}

// DocBase is the state a write was made against. Version 0 means "the server has no such draft".
type DocBase struct {
	Version   int64
	UpdatedAt int64
}

// DocWrite is what a PUT stores. A tombstone has Deleted set and empty Data.
type DocWrite struct {
	CreatedAt int64
	UpdatedAt int64
	Deleted   bool
	Data      string
}

// docRow reads one draft of the client account; lock adds FOR UPDATE (inside a transaction).
func docRow(ctx context.Context, q interface {
	QueryRow(context.Context, string, ...any) pgx.Row
}, clientID int64, id string, lock string) (Doc, error) {
	d := Doc{ID: id}
	err := q.QueryRow(ctx, `SELECT version, created_at, updated_at, deleted, data FROM docs WHERE client_id = $1 AND id = $2 `+lock,
		clientID, id).Scan(&d.Version, &d.CreatedAt, &d.UpdatedAt, &d.Deleted, &d.Data)
	return d, err
}

// ListDocs returns the states of up to limit drafts of the client account whose id sorts after `after`, in id order. Tombstones are
// included and no text is read.
func (s *Sync) ListDocs(ctx context.Context, clientID int64, after string, limit int) ([]DocState, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id, version, updated_at, deleted FROM docs
		WHERE client_id = $1 AND id > $2 ORDER BY id LIMIT $3`, clientID, after, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DocState{}
	for rows.Next() {
		var d DocState
		if err := rows.Scan(&d.ID, &d.Version, &d.UpdatedAt, &d.Deleted); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

// GetDoc returns one draft of the client account, tombstones included.
func (s *Sync) GetDoc(ctx context.Context, clientID int64, id string) (Doc, error) {
	d, err := docRow(ctx, s.db, clientID, id, "")
	if errors.Is(err, pgx.ErrNoRows) {
		return Doc{}, ErrDocNotFound
	}
	return d, err
}

// PutDoc is compare-and-set: in one transaction it locks the draft's row, checks that its version and updated_at equal base (an id
// the server does not have is base version 0 and is inserted), and writes it with version + 1. On a mismatch nothing changes and
// the stored row comes back with ErrConflict. A tombstone clears the text.
func (s *Sync) PutDoc(ctx context.Context, clientID int64, id string, base DocBase, w DocWrite) (Doc, error) {
	if w.Deleted {
		w.Data = ""
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return Doc{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	cur, err := docRow(ctx, tx, clientID, id, "FOR UPDATE")
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if base.Version != 0 {
			return Doc{}, ErrConflict // the server has nothing under this id: no copy to return
		}
		// Two first writes of the same id can race: the loser inserts nothing and reads the winner's row.
		tag, err := tx.Exec(ctx, `
			INSERT INTO docs (client_id, id, version, created_at, updated_at, deleted, data)
			VALUES ($1, $2, 1, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
			clientID, id, w.CreatedAt, w.UpdatedAt, w.Deleted, w.Data)
		if err != nil {
			return Doc{}, docWriteErr(err)
		}
		if tag.RowsAffected() == 0 {
			if cur, err = docRow(ctx, tx, clientID, id, ""); err != nil {
				return Doc{}, err
			}
			return cur, ErrConflict
		}
		if err := tx.Commit(ctx); err != nil {
			return Doc{}, err
		}
		return Doc{ID: id, Version: 1, CreatedAt: w.CreatedAt, UpdatedAt: w.UpdatedAt, Deleted: w.Deleted, Data: w.Data}, nil
	case err != nil:
		return Doc{}, err
	}

	if cur.Version != base.Version || cur.UpdatedAt != base.UpdatedAt {
		return cur, ErrConflict
	}
	next := cur.Version + 1
	if _, err := tx.Exec(ctx, `
		UPDATE docs SET version = $3, created_at = $4, updated_at = $5, deleted = $6, data = $7
		WHERE client_id = $1 AND id = $2`,
		clientID, id, next, w.CreatedAt, w.UpdatedAt, w.Deleted, w.Data); err != nil {
		return Doc{}, docWriteErr(err)
	}
	if err := tx.Commit(ctx); err != nil {
		return Doc{}, err
	}
	return Doc{ID: id, Version: next, CreatedAt: w.CreatedAt, UpdatedAt: w.UpdatedAt, Deleted: w.Deleted, Data: w.Data}, nil
}
