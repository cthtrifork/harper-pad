// Package store is the app's database: one SQLite file in the user's data folder holding the drafts and the settings. It uses the
// pure-Go driver (no cgo) and the default rollback journal, so no -wal or -shm files appear beside it.
package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

// schemaVersion is the compatibility level (PRAGMA user_version): a build refuses a database with a higher number. It goes up only
// for changes an older build could not live with. Additive changes (a new table, such as sync_state) leave it alone.
const schemaVersion = 2

// dsnOptions are applied to every connection the driver opens:
//   - busy_timeout: wait for a lock (another instance of the app) instead of failing at once;
//   - foreign_keys: SQLite leaves them off by default;
//   - trusted_schema off: SQL functions in views and triggers stored in the file cannot run unless they are safe;
//   - _txlock=immediate: a transaction takes the write lock at the start, so it cannot hit SQLITE_BUSY halfway.
const dsnOptions = "?_pragma=busy_timeout(5000)&_pragma=foreign_keys(1)&_pragma=trusted_schema(0)&_txlock=immediate"

var (
	// ErrNewer is returned by Open when the database was written by a newer version of the app. It is left untouched.
	ErrNewer = errors.New("the database was created by a newer version of Harper Pad")

	errIntegrity = errors.New("SQLite's integrity check failed")
)

// Store is the database.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// Open opens (and, on first use, creates) the database at path. A file that is not a database, or fails SQLite's
// integrity check, is moved aside as <path>.bad-<time> and a fresh database is created, so a damaged file never stops
// the app. A database from a newer app version is refused with ErrNewer and left alone.
func Open(path string) (*Store, error) {
	if strings.ContainsAny(path, "?#") {
		return nil, fmt.Errorf("the database path %q contains a character SQLite cannot take in a file name", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	st, err := openAt(path)
	if err != nil && isDamaged(err) {
		log.Printf("store: %s is damaged (%v); moving it aside and starting a new database", path, err)
		if _, mvErr := MoveAside(path); mvErr != nil {
			return nil, fmt.Errorf("%s is damaged (%v) and could not be moved aside: %w", path, err, mvErr)
		}
		st, err = openAt(path)
	}
	return st, err
}

// MoveAside renames the database at path to <path>.bad-<time> (and removes its leftover journal), so that Open creates a new one
// there. The old file is kept, not deleted. It returns the new name of the old file.
func MoveAside(path string) (string, error) {
	bad := fmt.Sprintf("%s.bad-%d", path, time.Now().Unix())
	if err := os.Rename(path, bad); err != nil {
		return "", err
	}
	_ = os.Remove(path + "-journal")
	return bad, nil
}

func openAt(path string) (*Store, error) {
	db, err := sql.Open("sqlite", filepath.ToSlash(path)+dsnOptions)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // one writer at a time, in order
	s := &Store{db: db, now: time.Now}
	if err := s.prepare(); err != nil {
		_ = db.Close()
		return nil, err
	}
	// The file is private to the user, as the other files in the folder are.
	_ = os.Chmod(path, 0o600)
	return s, nil
}

// prepare creates the schema on a new database and checks an existing one.
func (s *Store) prepare() error {
	var version int
	if err := s.db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return err
	}
	switch {
	case version > schemaVersion:
		return ErrNewer
	case version == 0:
		return s.create()
	}
	var check string
	if err := s.db.QueryRow(`PRAGMA quick_check(1)`).Scan(&check); err != nil {
		return err
	}
	if check != "ok" {
		return fmt.Errorf("%w: %s", errIntegrity, check)
	}
	if version < schemaVersion {
		if err := s.migrate(version); err != nil {
			return err
		}
	}
	if err := s.ensureFileHash(); err != nil {
		return err
	}
	return s.ensureSyncState()
}

// ensureFileHash adds file_hash to a drafts table that lacks it: the hash of the text the draft had when it last matched its file, to tell a
// draft with no edits of its own since then. Additive like sync_state, so the compatibility level is unchanged and an older build ignores it.
func (s *Store) ensureFileHash() error {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM pragma_table_info('drafts') WHERE name = 'file_hash'`).Scan(&n); err != nil || n > 0 {
		return err
	}
	_, err := s.db.Exec(`ALTER TABLE drafts ADD COLUMN file_hash TEXT NOT NULL DEFAULT ''`)
	return err
}

// ensureSyncState adds the sync_state table to a database that does not have it yet. It is an additive change, so it does not
// raise user_version: an older build still opens the file (it never reads the table) and loses nothing. user_version only goes up
// for a change that an older build would misread or damage.
func (s *Store) ensureSyncState() error {
	var n int
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'sync_state'`).Scan(&n); err != nil || n > 0 {
		return err
	}
	_, err := s.db.Exec(syncStateDDL)
	return err
}

// migrate brings an older database up to schemaVersion. Version 2 added file_path, the file a draft was saved to, and file_mtime.
func (s *Store) migrate(from int) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if from < 2 {
		for _, col := range []string{`file_path TEXT NOT NULL DEFAULT ''`, `file_mtime INTEGER NOT NULL DEFAULT 0`} {
			if _, err := tx.Exec(`ALTER TABLE drafts ADD COLUMN ` + col); err != nil {
				return err
			}
		}
	}
	if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, schemaVersion)); err != nil {
		return err
	}
	return tx.Commit()
}

// draftColumns are the summary columns of the drafts table, written whenever a draft is saved. The list reads only these, never
// the text, so listing is quick however large the drafts are.
const draftColumns = `
	format      TEXT    NOT NULL DEFAULT 'markdown',
	title       TEXT    NOT NULL DEFAULT '',
	excerpt     TEXT    NOT NULL DEFAULT '',
	tasks       TEXT    NOT NULL DEFAULT '[]',
	tasks_total INTEGER NOT NULL DEFAULT 0,
	tasks_done  INTEGER NOT NULL DEFAULT 0,
		file_path   TEXT    NOT NULL DEFAULT '',
		file_mtime  INTEGER NOT NULL DEFAULT 0,
		file_hash   TEXT    NOT NULL DEFAULT ''`

// create makes the schema in a new database.
func (s *Store) create() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }() // after a Commit this is a harmless ErrTxDone
	for _, stmt := range []string{
		// STRICT makes SQLite enforce the column types (a text in an INTEGER column is an error, not stored).
		`CREATE TABLE IF NOT EXISTS drafts (
			id         TEXT PRIMARY KEY,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			data       TEXT NOT NULL,` + draftColumns + `
		) STRICT`,
		`CREATE INDEX IF NOT EXISTS drafts_by_updated ON drafts (updated_at DESC, id DESC)`,
		`CREATE TABLE IF NOT EXISTS settings (
			key   TEXT PRIMARY KEY,
			value TEXT NOT NULL
		) STRICT, WITHOUT ROWID`,
		syncStateDDL,
		fmt.Sprintf(`PRAGMA user_version = %d`, schemaVersion),
	} {
		if _, err := tx.Exec(stmt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// isDamaged reports whether err means the file is not a usable database, as opposed to a problem with the disk or
// permissions, or a newer database.
func isDamaged(err error) bool {
	if errors.Is(err, errIntegrity) {
		return true
	}
	var se *sqlite.Error
	if errors.As(err, &se) {
		switch se.Code() & 0xff {
		case sqlite3.SQLITE_NOTADB, sqlite3.SQLITE_CORRUPT:
			return true
		}
	}
	return false
}

// Close lets SQLite refresh its query statistics (PRAGMA optimize, as its documentation recommends before closing a
// connection) and closes the database.
func (s *Store) Close() error {
	_, _ = s.db.Exec(`PRAGMA optimize`)
	return s.db.Close()
}
