package store

import (
	"crypto/rand"
	"database/sql"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
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
	MaxContentBytes = 5 << 20

	defaultLimit = 50
	maxLimit     = 500
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
