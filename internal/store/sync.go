package store

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"unicode/utf8"
)

// What the optional sync (docs/sync.md) needs locally. It lives apart from the drafts so that leaving sync off changes nothing and
// an older build can still use the file. Changes are found by comparing hashes, so edits and deletes made by an older build are
// seen too; a delete is a sync_state row whose draft is gone.

// syncStateDDL creates the table (see Store.ensureSyncState). No foreign key: a row outlives its draft.
const syncStateDDL = `CREATE TABLE IF NOT EXISTS sync_state (
	id         TEXT PRIMARY KEY,
	hash       TEXT    NOT NULL,
	updated_at INTEGER NOT NULL,
	deleted    INTEGER NOT NULL DEFAULT 0,
	version    INTEGER NOT NULL
) STRICT, WITHOUT ROWID`

// SyncState is what the server held for a draft at the last sync. Version is the base of the next write.
type SyncState struct {
	Hash      string
	UpdatedAt int64
	Deleted   bool
	Version   int64
}

// Changes is what differs from the server's last known state.
type Changes struct {
	// Changed are the drafts to upload: new ones, and ones whose text or format differ from the last sync.
	Changed []string
	// Deleted are the ids of drafts deleted here that the server still has.
	Deleted []string
}

// ContentHash is the hash a draft is compared by: SHA-256, in hex, of the format, a newline and the text, as UTF-8. The web build
// computes the same value (frontend/src/lib/contentHash.js); both check internal/store/testdata/contenthash.json.
func ContentHash(format, content string) string {
	h := sha256.New()
	h.Write([]byte(format))
	h.Write([]byte{'\n'})
	h.Write([]byte(content))
	return hex.EncodeToString(h.Sum(nil))
}

// SyncState returns the recorded state of a draft; ok is false when the server has never been told about it.
func (s *Store) SyncState(id string) (st SyncState, ok bool, err error) {
	var deleted int
	err = s.db.QueryRow(`SELECT hash, updated_at, deleted, version FROM sync_state WHERE id = ?`, id).
		Scan(&st.Hash, &st.UpdatedAt, &deleted, &st.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return SyncState{}, false, nil
	}
	st.Deleted = deleted != 0
	return st, err == nil, err
}

// MarkSynced records what the server now holds for a draft, after a push it accepted. Pass the hash of the text that was
// sent, not of what is stored now, so that an edit made while the request was in flight is still a change.
func (s *Store) MarkSynced(id string, st SyncState) error {
	if !idPattern.MatchString(id) {
		return fmt.Errorf("%q is not a draft id", id)
	}
	return putState(s.db, id, st)
}

type execer interface {
	Exec(query string, args ...any) (sql.Result, error)
}

func putState(db execer, id string, st SyncState) error {
	deleted := 0
	if st.Deleted {
		deleted = 1
	}
	_, err := db.Exec(`INSERT INTO sync_state (id, hash, updated_at, deleted, version) VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET hash = excluded.hash, updated_at = excluded.updated_at,
			deleted = excluded.deleted, version = excluded.version`, id, st.Hash, st.UpdatedAt, deleted, st.Version)
	return err
}

// Changes lists what has to be pushed. It reads every draft's text to hash it, so it is for Sync all, not for each keystroke.
func (s *Store) Changes() (Changes, error) {
	out := Changes{Changed: []string{}, Deleted: []string{}}
	rows, err := s.db.Query(`SELECT d.id, d.data, COALESCE(t.hash, '') FROM drafts d LEFT JOIN sync_state t ON t.id = d.id ORDER BY d.id`)
	if err != nil {
		return Changes{}, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var id, data, synced string
		if err := rows.Scan(&id, &data, &synced); err != nil {
			return Changes{}, err
		}
		b, err := decode(data)
		if err != nil {
			return Changes{}, fmt.Errorf("draft %s: %w", id, err)
		}
		if synced == "" || ContentHash(b.Format, b.Content) != synced {
			out.Changed = append(out.Changed, id)
		}
	}
	if err := rows.Err(); err != nil {
		return Changes{}, err
	}
	del, err := s.db.Query(`SELECT id FROM sync_state WHERE deleted = 0 AND id NOT IN (SELECT id FROM drafts) ORDER BY id`)
	if err != nil {
		return Changes{}, err
	}
	defer func() { _ = del.Close() }()
	for del.Next() {
		var id string
		if err := del.Scan(&id); err != nil {
			return Changes{}, err
		}
		out.Deleted = append(out.Deleted, id)
	}
	return out, del.Err()
}

// ApplyRemote stores a draft as the server has it, with the server's timestamps, and records it as synced. An existing draft keeps
// its file link.
func (s *Store) ApplyRemote(d Draft, version int64) (Draft, error) {
	if err := checkDraft(&d); err != nil {
		return Draft{}, err
	}
	if !idPattern.MatchString(d.ID) {
		return Draft{}, fmt.Errorf("%q is not a draft id", d.ID)
	}
	if d.CreatedAt <= 0 || d.UpdatedAt <= 0 {
		return Draft{}, errors.New("a synced draft needs its created and updated times")
	}
	data, err := json.Marshal(blob{V: 1, Format: d.Format, Content: d.Content})
	if err != nil {
		return Draft{}, err
	}
	sm := summarizeColumns(d.Format, d.Content)
	tx, err := s.db.Begin()
	if err != nil {
		return Draft{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`INSERT INTO drafts (id, created_at, updated_at, data, format, title, excerpt, tasks, tasks_total, tasks_done)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, updated_at = excluded.updated_at, data = excluded.data,
			format = excluded.format, title = excluded.title, excerpt = excluded.excerpt, tasks = excluded.tasks,
			tasks_total = excluded.tasks_total, tasks_done = excluded.tasks_done`,
		d.ID, d.CreatedAt, d.UpdatedAt, string(data), sm.format, sm.title, sm.excerpt, sm.tasks, sm.total, sm.done); err != nil {
		return Draft{}, err
	}
	if err := putState(tx, d.ID, SyncState{Hash: ContentHash(d.Format, d.Content), UpdatedAt: d.UpdatedAt, Version: version}); err != nil {
		return Draft{}, err
	}
	if err := tx.Commit(); err != nil {
		return Draft{}, err
	}
	return s.Get(d.ID)
}

// ApplyRemoteDelete removes a draft whose server copy is a tombstone, and records that so it is not a pending delete. A missing
// draft is not an error, and the file the draft was saved to is left alone.
func (s *Store) ApplyRemoteDelete(id string, version, updatedAt int64) error {
	if !idPattern.MatchString(id) {
		return fmt.Errorf("%q is not a draft id", id)
	}
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if _, err := tx.Exec(`DELETE FROM drafts WHERE id = ?`, id); err != nil {
		return err
	}
	if err := putState(tx, id, SyncState{UpdatedAt: updatedAt, Deleted: true, Version: version}); err != nil {
		return err
	}
	return tx.Commit()
}

// checkDraft applies the limits that Save and ApplyRemote share: a known format (markdown when empty), at most MaxContentBytes of
// valid UTF-8.
func checkDraft(d *Draft) error {
	if d.Format == "" {
		d.Format = FormatMarkdown
	}
	if d.Format != FormatMarkdown && d.Format != FormatText {
		return fmt.Errorf("unknown draft format %q", d.Format)
	}
	if len(d.Content) > MaxContentBytes {
		return fmt.Errorf("the draft is %d bytes; the limit is %d", len(d.Content), MaxContentBytes)
	}
	if !utf8.ValidString(d.Content) {
		return errors.New("the draft is not valid UTF-8 text")
	}
	return nil
}
