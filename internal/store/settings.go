package store

import "fmt"

// Settings returns every saved setting. Values are text; the caller decides what a value holds.
func (s *Store) Settings() (map[string]string, error) {
	rows, err := s.db.Query(`SELECT key, value FROM settings`)
	if err != nil {
		return nil, err
	}
	defer func() { _ = rows.Close() }()
	out := map[string]string{}
	for rows.Next() {
		var k, v string
		if err := rows.Scan(&k, &v); err != nil {
			return nil, err
		}
		out[k] = v
	}
	return out, rows.Err()
}

// SetSettings saves the given settings in one transaction, so either all of them are stored or none. Keys that are not
// mentioned are left as they are.
func (s *Store) SetSettings(kv map[string]string) error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }() // after a Commit this is a harmless ErrTxDone
	for k, v := range kv {
		if k == "" {
			return fmt.Errorf("a setting needs a name")
		}
		if _, err := tx.Exec(`INSERT INTO settings (key, value) VALUES (?, ?)
			ON CONFLICT(key) DO UPDATE SET value = excluded.value`, k, v); err != nil {
			return err
		}
	}
	return tx.Commit()
}
