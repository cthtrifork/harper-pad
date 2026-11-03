package store

import (
	"testing"
	"time"
)

// The connection options in dsnOptions must really be in effect.
func TestConnectionSettingsApply(t *testing.T) {
	s, _ := open(t)
	for pragma, want := range map[string]int{"busy_timeout": 5000, "foreign_keys": 1, "trusted_schema": 0} {
		var got int
		if err := s.db.QueryRow(`PRAGMA ` + pragma).Scan(&got); err != nil || got != want {
			t.Errorf("PRAGMA %s = %d, %v; want %d", pragma, got, err, want)
		}
	}
}

// STRICT tables refuse a value of the wrong type instead of storing it.
func TestTablesAreStrict(t *testing.T) {
	s, _ := open(t)
	if _, err := s.db.Exec(`INSERT INTO drafts (id, created_at, updated_at, data) VALUES ('x', 'not a number', 1, '{}')`); err == nil {
		t.Error("a text value went into an INTEGER column")
	}
	if _, err := s.db.Exec(`INSERT INTO settings (key, value) VALUES ('k', 5)`); err != nil {
		t.Errorf("a number should convert to text in a TEXT column: %v", err)
	}
	if _, err := s.db.Exec(`INSERT INTO settings (key, value) VALUES ('k2', x'00ff')`); err == nil {
		t.Error("a blob went into a TEXT column")
	}
}

// A second connection to the same file (another instance of the app) waits for the first one's write lock instead of
// failing with "database is locked".
func TestSecondInstanceWaitsForTheWriteLock(t *testing.T) {
	a, path := open(t)
	b, err := Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer b.Close()

	tx, err := a.db.Begin() // takes the write lock at once (_txlock=immediate)
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan error, 1)
	start := time.Now()
	go func() {
		_, err := b.Save(Draft{Content: "from the second instance"})
		done <- err
	}()
	time.Sleep(300 * time.Millisecond)
	select {
	case err := <-done:
		t.Fatalf("the second write did not wait for the lock (err %v)", err)
	default:
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if err := <-done; err != nil {
		t.Fatalf("the second write failed after the lock was released: %v", err)
	}
	if time.Since(start) < 250*time.Millisecond {
		t.Error("the second write finished before the first released the lock")
	}
	if l, _ := a.List(10, 0); l.Total != 1 {
		t.Errorf("drafts = %d, want 1", l.Total)
	}
}
