package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"
	"unicode/utf8"
)

// Drafts are notes, task lists and half-written text that live inside the app and are not files until the user saves
// one as a file.

const (
	// FormatMarkdown and FormatText are the document formats; markdown drafts get the preview and task lines.
	FormatMarkdown = "markdown"
	FormatText     = "text"

	// MaxContentBytes caps one draft, so a paste of something huge cannot fill the disk.
	MaxContentBytes = 1 << 20

	defaultLimit = 500
	maxLimit     = 1000
)

var (
	// ErrNotFound is returned by Get for an id that is not stored.
	ErrNotFound = errors.New("draft not found")

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
	// FilePath is the file the draft was saved to ("" when it never was). The draft stays here too; Save ignores this field
	// and only SetFile changes it, so the path always comes from the save dialog and never from the page.
	FilePath string `json:"filePath"`
	// FileMTime is the file's modification time (Unix nanoseconds) right after it was last written here, to notice when something
	// else changes it. Not sent to the page.
	FileMTime int64 `json:"-"`
	// FileHash is FileContentHash of the draft's text when it last matched its file (written to it, reloaded from it, or found equal), or
	// "" when unknown. A draft whose text still has this hash has no edits of its own since the file was in step. Not sent to the page.
	FileHash string `json:"-"`
	// FileSize is the file's size in bytes at that moment, -1 when unknown. With FileMTime and FileHash it is the identity of the file version the
	// draft last matched: a write checks all three, so a file that changed with its mtime kept (rsync -t) is not replaced silently.
	FileSize int64 `json:"-"`
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
	FilePath  string `json:"filePath"`
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
	if err := checkDraft(&d); err != nil {
		return Draft{}, err
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
	sm := summarizeColumns(d.Format, d.Content)
	_, err = s.db.Exec(`INSERT INTO drafts (id, created_at, updated_at, data, format, title, excerpt, tasks, tasks_total, tasks_done)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at, data = excluded.data, format = excluded.format,
			title = excluded.title, excerpt = excluded.excerpt, tasks = excluded.tasks,
			tasks_total = excluded.tasks_total, tasks_done = excluded.tasks_done`,
		d.ID, created, now.UnixMilli(), string(data), sm.format, sm.title, sm.excerpt, sm.tasks, sm.total, sm.done)
	if err != nil {
		return Draft{}, err
	}
	return s.Get(d.ID)
}

// Get returns one draft, or ErrNotFound.
func (s *Store) Get(id string) (Draft, error) {
	var d Draft
	var data string
	err := s.db.QueryRow(`SELECT id, created_at, updated_at, data, file_path, file_mtime, file_hash, file_size FROM drafts WHERE id = ?`, id).
		Scan(&d.ID, &d.CreatedAt, &d.UpdatedAt, &data, &d.FilePath, &d.FileMTime, &d.FileHash, &d.FileSize)
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

// FileContentHash is the hash kept as Draft.FileHash: of the text with CRLF and CR turned into LF, so a file's line endings do not matter.
func FileContentHash(text string) string {
	return ContentHash("", strings.ReplaceAll(strings.ReplaceAll(text, "\r\n", "\n"), "\r", "\n"))
}

// SetFileHash records that the draft's text, as given, is what its file holds, and the file's size in bytes (see Draft.FileHash).
func (s *Store) SetFileHash(id, text string, size int64) error {
	_, err := s.db.Exec(`UPDATE drafts SET file_hash = ?, file_size = ? WHERE id = ?`, FileContentHash(text), size, id)
	return err
}

// LinkFile links the draft to a file in one transaction: the path, the file's mtime and size after the write, and the hash of the text it
// holds (see Draft.FileHash). Any other draft linked to the same path is unlinked in the same transaction, so a file has one holder; their
// titles are returned. ErrNotFound when there is no such draft.
func (s *Store) LinkFile(id, path string, mtime int64, text string, size int64) ([]string, error) {
	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var titles []string
	rows, err := tx.Query(`SELECT title FROM drafts WHERE file_path = ? AND id <> ?`, path, id)
	if err != nil {
		return nil, err
	}
	for rows.Next() {
		var t string
		if err := rows.Scan(&t); err != nil {
			_ = rows.Close()
			return nil, err
		}
		if t == "" {
			t = "Untitled"
		}
		titles = append(titles, t)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if _, err := tx.Exec(`UPDATE drafts SET file_path = '', file_mtime = 0, file_hash = '', file_size = -1 WHERE file_path = ? AND id <> ?`, path, id); err != nil {
		return nil, err
	}
	res, err := tx.Exec(`UPDATE drafts SET file_path = ?, file_mtime = ?, file_hash = ?, file_size = ? WHERE id = ?`, path, mtime, FileContentHash(text), size, id)
	if err != nil {
		return nil, err
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return nil, ErrNotFound
	}
	return titles, tx.Commit()
}

// SetFile records the file a draft was saved to and its modification time after the write, or clears both with "" and 0. It also forgets
// the file hash: call SetFileHash after it when the text is known to match.
// ErrNotFound when there is no such draft.
func (s *Store) SetFile(id, path string, mtime int64) error {
	res, err := s.db.Exec(`UPDATE drafts SET file_path = ?, file_mtime = ?, file_hash = '', file_size = -1 WHERE id = ?`, path, mtime, id)
	if err != nil {
		return err
	}
	if n, err := res.RowsAffected(); err == nil && n == 0 {
		return ErrNotFound
	}
	return nil
}

// Delete removes a draft. Deleting one that is not there is not an error.
func (s *Store) Delete(id string) error {
	_, err := s.db.Exec(`DELETE FROM drafts WHERE id = ?`, id)
	return err
}

// List returns drafts newest first. limit defaults to 50 and is capped at 500.
func (s *Store) List(limit, offset int) (List, error) {
	return s.query(nil, limit, offset)
}

// Search returns the drafts whose text contains query, newest first. The match ignores case for ASCII letters only
// (SQLite's LIKE); an empty query lists everything.
func (s *Store) Search(query string, limit int) (List, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return s.List(limit, 0)
	}
	esc := strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(query)
	pattern := "%" + esc + "%"
	return s.query(&pattern, limit, 0)
}

// whereMatches is the only fragment ever added to the list query, and it is a constant: the caller's text reaches SQLite
// only as the value of its ? parameter, never as SQL.
const whereMatches = ` WHERE json_extract(data, '$.content') LIKE ? ESCAPE '\'`

// query lists drafts newest first. pattern is a LIKE pattern for the content, or nil for no filter.
func (s *Store) query(pattern *string, limit, offset int) (List, error) {
	if limit <= 0 {
		limit = defaultLimit
	}
	limit = min(limit, maxLimit)
	offset = max(offset, 0)
	var args []any
	where := ""
	if pattern != nil {
		where = whereMatches
		args = append(args, *pattern)
	}
	out := List{Drafts: []Summary{}}
	if err := s.db.QueryRow(`SELECT COUNT(*) FROM drafts`+where, args...).Scan(&out.Total); err != nil {
		return List{}, err
	}
	// Only the summary columns are read, never the text (the data column), so this stays quick however large the drafts are.
	rows, err := s.db.Query(`SELECT id, created_at, updated_at, file_path, format, title, excerpt, tasks, tasks_total, tasks_done FROM drafts`+where+
		` ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`, append(args, limit, offset)...)
	if err != nil {
		return List{}, err
	}
	defer func() { _ = rows.Close() }()
	for rows.Next() {
		var sum Summary
		var tasks string
		if err := rows.Scan(&sum.ID, &sum.CreatedAt, &sum.UpdatedAt, &sum.FilePath, &sum.Format, &sum.Title, &sum.Excerpt, &tasks, &sum.TasksTotal, &sum.TasksDone); err != nil {
			return List{}, err
		}
		if err := json.Unmarshal([]byte(tasks), &sum.Tasks); err != nil || sum.Tasks == nil {
			sum.Tasks = []Task{}
		}
		if sum.Title == "" {
			sum.Title = "Untitled"
		}
		out.Drafts = append(out.Drafts, sum)
	}
	return out, rows.Err()
}

// summaryColumns is a draft's summary as it is stored: what summarize works out, ready to write.
type summaryColumns struct {
	format, title, excerpt, tasks string
	total, done                   int
}

func summarizeColumns(format, content string) summaryColumns {
	title, excerpt, tasks, total, done := summarize(content)
	js, err := json.Marshal(tasks)
	if err != nil {
		js = []byte("[]")
	}
	return summaryColumns{format: format, title: title, excerpt: excerpt, tasks: string(js), total: total, done: done}
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

// Title is the draft's title as the drawer shows it: its first line without the markdown marks, or "Untitled".
func Title(content string) string {
	title, _, _, _, _ := summarize(content)
	return title
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
