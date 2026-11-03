// Package drafts keeps the user's drafts: notes, task lists and half-written text that live inside the app and are not
// files until the user saves them as one.
//
// They are stored in one SQLite file (the pure-Go driver, so no cgo). A row is an id, two timestamps and the draft itself
// as a JSON blob; the title, excerpt and task preview are worked out from the content when listing, not stored. The
// journal is SQLite's default rollback journal, so there are no -wal or -shm files beside the database, and a crash
// leaves the last committed state.
package drafts

import (
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"
)

const (
	// FormatMarkdown and FormatText are the document formats; markdown drafts get the preview and task lines.
	FormatMarkdown = "markdown"
	FormatText     = "text"

	// MaxContentBytes caps one draft, so a paste of something huge cannot fill the disk.
	MaxContentBytes = 5 << 20

	schemaVersion = 1
	defaultLimit  = 50
	maxLimit      = 500
)

var (
	// ErrNotFound is returned by Get for an id that is not stored.
	ErrNotFound = errors.New("draft not found")
	// ErrNewer is returned by Open when the database was written by a newer version of the app. It is left untouched.
	ErrNewer = errors.New("the drafts database was created by a newer version of Harper Pad")

	errIntegrity = errors.New("SQLite's integrity check failed")

	idPattern   = regexp.MustCompile(`^[0-9a-f]{32}$`)
	taskPattern = regexp.MustCompile(`^\s*[-*+]\s+\[([ xX])\]\s+(.*\S)\s*$`)
	headPattern = regexp.MustCompile(`^\s*(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?)`)
)

// Draft is one stored draft. Timestamps are Unix milliseconds.
type Draft struct {
	ID        string `json:"id"`
	Format    string `json:"format"`
	Content   string `json:"content"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

// Task is one markdown task line, as shown in a draft's preview.
type Task struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

// Summary is what the drawer lists for a draft.
type Summary struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Format    string `json:"format"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
	// Excerpt is the start of the text after the title, on one line, without the task lines (they are in Tasks).
	Excerpt string `json:"excerpt"`
	// Tasks holds the first few task lines; TasksTotal and TasksDone count all of them.
	Tasks      []Task `json:"tasks"`
	TasksTotal int    `json:"tasksTotal"`
	TasksDone  int    `json:"tasksDone"`
}

// List is a page of summaries, newest first, and how many drafts match in all.
type List struct {
	Drafts []Summary `json:"drafts"`
	Total  int       `json:"total"`
}

// blob is the JSON stored in the data column. v lets later versions tell old rows from new ones.
type blob struct {
	V       int    `json:"v"`
	Format  string `json:"format"`
	Content string `json:"content"`
}

// Store is the drafts database.
type Store struct {
	db  *sql.DB
	now func() time.Time
}

// Open opens (and, on first use, creates) the database at path. A file that is not a database, or fails SQLite's
// integrity check, is moved aside as <path>.bad-<time> and a fresh database is created, so a damaged file never stops
// the app. A database from a newer app version is refused with ErrNewer and left alone.
func Open(path string) (*Store, error) {
	if strings.ContainsAny(path, "?#") {
		return nil, fmt.Errorf("the drafts path %q contains a character SQLite cannot take in a file name", path)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, err
	}
	st, err := openAt(path)
	if err != nil && isDamaged(err) {
		bad := fmt.Sprintf("%s.bad-%d", path, time.Now().Unix())
		log.Printf("drafts: %s is damaged (%v); moving it to %s and starting a new database", path, err, bad)
		if mvErr := os.Rename(path, bad); mvErr != nil {
			return nil, fmt.Errorf("%s is damaged (%v) and could not be moved aside: %w", path, err, mvErr)
		}
		_ = os.Remove(path + "-journal")
		st, err = openAt(path)
	}
	return st, err
}

func openAt(path string) (*Store, error) {
	db, err := sql.Open("sqlite", filepath.ToSlash(path)+"?_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1) // one writer at a time, in order
	s := &Store{db: db, now: time.Now}
	if err := s.prepare(); err != nil {
		db.Close()
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
		tx, err := s.db.Begin()
		if err != nil {
			return err
		}
		defer tx.Rollback()
		for _, stmt := range []string{
			`CREATE TABLE IF NOT EXISTS drafts (
				id         TEXT PRIMARY KEY,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL,
				data       TEXT NOT NULL
			)`,
			`CREATE INDEX IF NOT EXISTS drafts_by_updated ON drafts (updated_at DESC, id DESC)`,
			fmt.Sprintf(`PRAGMA user_version = %d`, schemaVersion),
		} {
			if _, err := tx.Exec(stmt); err != nil {
				return err
			}
		}
		return tx.Commit()
	}
	var check string
	if err := s.db.QueryRow(`PRAGMA quick_check(1)`).Scan(&check); err != nil {
		return err
	}
	if check != "ok" {
		return fmt.Errorf("%w: %s", errIntegrity, check)
	}
	return nil
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

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

func newID(now time.Time) string {
	var b [16]byte
	binary.BigEndian.PutUint64(b[:8], uint64(now.UnixMilli())<<16) // 6 bytes of time, so ids sort by creation
	if _, err := rand.Read(b[6:]); err != nil {
		panic(err) // the system's random source failing is not recoverable
	}
	return hex.EncodeToString(b[:])
}

// Save stores a draft. With an empty ID it creates one. With an ID it updates that draft, or, when none is stored under
// it, restores it (undoing a delete), keeping CreatedAt if given. UpdatedAt is always set to now. The stored draft is returned.
func (s *Store) Save(d Draft) (Draft, error) {
	if d.Format == "" {
		d.Format = FormatMarkdown
	}
	if d.Format != FormatMarkdown && d.Format != FormatText {
		return Draft{}, fmt.Errorf("unknown draft format %q", d.Format)
	}
	if len(d.Content) > MaxContentBytes {
		return Draft{}, fmt.Errorf("the draft is %d bytes; the limit is %d", len(d.Content), MaxContentBytes)
	}
	if !utf8.ValidString(d.Content) {
		return Draft{}, errors.New("the draft is not valid UTF-8 text")
	}
	now := s.now()
	if d.ID == "" {
		d.ID = newID(now)
		d.CreatedAt = 0
	} else if !idPattern.MatchString(d.ID) {
		return Draft{}, fmt.Errorf("%q is not a draft id", d.ID)
	}
	created := d.CreatedAt
	if created <= 0 {
		created = now.UnixMilli()
	}
	data, err := json.Marshal(blob{V: 1, Format: d.Format, Content: d.Content})
	if err != nil {
		return Draft{}, err
	}
	_, err = s.db.Exec(`INSERT INTO drafts (id, created_at, updated_at, data) VALUES (?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data`,
		d.ID, created, now.UnixMilli(), string(data))
	if err != nil {
		return Draft{}, err
	}
	return s.Get(d.ID)
}

// Get returns one draft, or ErrNotFound.
func (s *Store) Get(id string) (Draft, error) {
	var d Draft
	var data string
	err := s.db.QueryRow(`SELECT id, created_at, updated_at, data FROM drafts WHERE id = ?`, id).
		Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt, &data)
	if errors.Is(err, sql.ErrNoRows) {
		return Draft{}, ErrNotFound
	}
	if err != nil {
		return Draft{}, err
	}
	b, err := decode(data)
	if err != nil {
		return Draft{}, fmt.Errorf("draft %s: %w", id, err)
	}
	d.Format, d.Content = b.Format, b.Content
	return d, nil
}

// Delete removes a draft. Deleting one that is not there is not an error.
func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM drafts WHERE id = ?`, id)
	return err
}

// List returns drafts newest first. limit defaults to 50 and is capped at 500.
func (s *Store) List(limit, offset int) (List, error) {
	return s.query("", "", limit, offset)
}

// Search returns the drafts whose text contains query, newest first. The match ignores case for ASCII letters only
// (SQLite's LIKE); an empty query lists everything.
func (s *Store) Search(query string, limit int) (List, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return s.List(limit, 0)
	}
	esc := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
	return s.query(` WHERE json_extract(data, '$.content') LIKE ? ESCAPE '\'`, "%"+esc+"%", limit, 0)
}

func (s *Store) query(where, arg string, limit, offset int) (List, error) {
	if limit <= 0 {
		limit = defaultLimit
	}
	limit = min(limit, maxLimit)
	offset = max(offset, 0)
	var args []any
	if where != "" {
		args = append(args, arg)
	}
	out := List{Drafts: []Summary{}}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM drafts`+where, args...).Scan(&out.Total); err != nil {
		return List{}, err
	}
	rows, err := s.db.Query(`SELECT id, created_at, updated_at, data FROM drafts`+where+
		` ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return List{}, err
	}
	defer rows.Close()
	for rows.Next() {
		var sum Summary
		var data string
		if err := rows.Scan(&sum.ID, &sum.CreatedAt, &sum.UpdatedAt, &data); err != nil {
			return List{}, err
		}
		b, err := decode(data)
		if err != nil {
			log.Printf("drafts: skipping %s: %v", sum.ID, err)
			continue
		}
		sum.Format = b.Format
		sum.Title, sum.Excerpt, sum.Tasks, sum.TasksTotal, sum.TasksDone = summarize(b.Content)
		out.Drafts = append(out.Drafts, sum)
	}
	return out, rows.Err()
}

// decode reads a stored blob. Older or missing fields get their defaults, so rows written by an earlier version still load.
func decode(data string) (blob, error) {
	var b blob
	if err := json.Unmarshal([]byte(data), &b); err != nil {
		return blob{}, err
	}
	if b.Format == "" {
		b.Format = FormatMarkdown
	}
	return b, nil
}

// summarize works out what the drawer shows for a draft.
func summarize(content string) (title, excerpt string, tasks []Task, total, done int) {
	tasks = []Task{}
	var rest []string
	for _, line := range strings.Split(content, "\n") {
		line = strings.TrimRight(line, "\r")
		m := taskPattern.FindStringSubmatch(line)
		if m != nil {
			total++
			isDone := m[1] != " "
			if isDone {
				done++
			}
			if len(tasks) < 3 {
				tasks = append(tasks, Task{Text: clip(m[2], 120), Done: isDone})
			}
		}
		if title == "" {
			if strings.TrimSpace(line) != "" {
				title = clip(strings.TrimSpace(headPattern.ReplaceAllString(line, "")), 80)
			}
			continue
		}
		if m == nil { // task lines are shown as tasks, so they stay out of the excerpt
			rest = append(rest, line)
		}
	}
	if title == "" {
		title = "Untitled"
	}
	return title, clip(strings.Join(strings.Fields(strings.Join(rest, " ")), " "), 160), tasks, total, done
}

// clip shortens s to at most n characters, with an ellipsis when it cut something off.
func clip(s string, n int) string {
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	r := []rune(s)
	return strings.TrimRight(string(r[:n-1]), " ") + "…"
}
