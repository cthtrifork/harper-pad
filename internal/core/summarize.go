package core

import (
	"strings"
	"unicode"
	"unicode/utf8"
)

// Limits of what the drafts list shows.
const (
	maxTitle    = 80
	maxTaskText = 120
	maxExcerpt  = 160
	maxTasks    = 3
)

// Task is one markdown task line, as shown in a draft's preview.
type Task struct {
	Text string `json:"text"`
	Done bool   `json:"done"`
}

// Summary is what the drafts list shows for a draft's text: its title, an excerpt, and a preview of its task lines.
type Summary struct {
	Title string `json:"title"`
	// Excerpt is the start of the text after the title, on one line, without the task lines (they are in Tasks).
	Excerpt string `json:"excerpt"`
	// Tasks holds the first few task lines; TasksTotal and TasksDone count all of them.
	Tasks      []Task `json:"tasks"`
	TasksTotal int    `json:"tasksTotal"`
	TasksDone  int    `json:"tasksDone"`
}

// Summarize works out what the drafts list shows for a draft. Tasks is never nil, so it encodes as [] and not null.
//
// It reads the text once, without regular expressions or copies of it, and stops collecting the excerpt as soon as it is full: it runs on
// every save, in the browser as WebAssembly, where a regexp engine and a copy of a 1 MB draft are slow (docs/wasm-core.md).
func Summarize(content string) Summary {
	s := Summary{Tasks: []Task{}}
	var ex excerpt
	for rest := content; ; {
		line, more := rest, false
		if i := strings.IndexByte(rest, '\n'); i >= 0 {
			line, rest, more = rest[:i], rest[i+1:], true
		}
		line = strings.TrimRight(line, "\r")
		text, done, isTask := task(line)
		if isTask {
			s.TasksTotal++
			if done {
				s.TasksDone++
			}
			if len(s.Tasks) < maxTasks {
				s.Tasks = append(s.Tasks, Task{Text: clip(text, maxTaskText), Done: done})
			}
		}
		switch {
		case s.Title == "":
			if strings.TrimSpace(line) != "" {
				s.Title = clip(strings.TrimSpace(line[headLen(line):]), maxTitle)
			}
		case !isTask: // task lines are shown as tasks, so they stay out of the excerpt
			ex.add(line)
		}
		if !more {
			break
		}
	}
	if s.Title == "" {
		s.Title = "Untitled"
	}
	s.Excerpt = clip(ex.b.String(), maxExcerpt)
	return s
}

// excerpt collects the words of the lines after the title, one space apart, and stops once there are more than an excerpt can show.
type excerpt struct {
	b    strings.Builder
	n    int // characters so far
	full bool
}

func (e *excerpt) add(line string) {
	for !e.full {
		line = strings.TrimLeftFunc(line, unicode.IsSpace)
		if line == "" {
			return
		}
		word := line
		if i := strings.IndexFunc(line, unicode.IsSpace); i >= 0 {
			word = line[:i]
		}
		line = line[len(word):]
		if e.n > 0 {
			e.b.WriteByte(' ')
			e.n++
		}
		e.b.WriteString(word)
		e.n += utf8.RuneCountInString(word)
		e.full = e.n > maxExcerpt
	}
}

// blank is what a markdown line treats as white space here: the ASCII set RE2's \s means (not \v, not Unicode spaces).
func blank(c byte) bool { return c == ' ' || c == '\t' || c == '\n' || c == '\f' || c == '\r' }

func skipBlanks(s string, i int) int {
	for i < len(s) && blank(s[i]) {
		i++
	}
	return i
}

func isBullet(c byte) bool { return c == '-' || c == '*' || c == '+' }

// bullet reads indentation, a bullet (- * +) and the white space after it, and returns where the rest of the line starts.
func bullet(line string) (rest int, ok bool) {
	i := skipBlanks(line, 0)
	if i >= len(line) || !isBullet(line[i]) {
		return 0, false
	}
	rest = skipBlanks(line, i+1)
	return rest, rest > i+1
}

// box reads a task box at line[i:], "[ ]", "[x]" or "[X]", and the white space after it. It returns whether the box is ticked and
// where the rest of the line starts.
func box(line string, i int) (done bool, rest int, ok bool) {
	if i+2 >= len(line) || line[i] != '[' || line[i+2] != ']' || (line[i+1] != ' ' && line[i+1] != 'x' && line[i+1] != 'X') {
		return false, 0, false
	}
	rest = skipBlanks(line, i+3)
	return line[i+1] != ' ', rest, rest > i+3
}

// task reports whether line is a markdown task, "- [ ] text", and if so its text without trailing white space and whether the box is
// ticked.
func task(line string) (text string, done, ok bool) {
	j, ok := bullet(line)
	if !ok {
		return "", false, false
	}
	done, k, ok := box(line, j)
	if !ok {
		return "", false, false
	}
	text = strings.TrimRight(line[k:], "\t\n\f\r ")
	return text, done, text != ""
}

// headLen is the length of the mark at the start of a title line that is not part of the title: indentation, then "#" to "######" and a
// space, or a bullet and a space with an optional task box ("- ", "- [ ] "). 0 when the line has no mark.
func headLen(line string) int {
	if j, ok := bullet(line); ok {
		if _, k, ok := box(line, j); ok {
			return k
		}
		return j
	}
	i := skipBlanks(line, 0)
	j := i
	for j < len(line) && line[j] == '#' {
		j++
	}
	if j > i && j-i <= 6 {
		if k := skipBlanks(line, j); k > j {
			return k
		}
	}
	return 0
}

// clip shortens s to at most n characters, with an ellipsis when it cut something off. It reads no further than n+1 characters of s.
func clip(s string, n int) string {
	count, cut := 0, 0
	for i := range s {
		if count == n-1 {
			cut = i
		}
		count++
		if count > n {
			return strings.TrimRight(s[:cut], " ") + "…"
		}
	}
	return s
}
