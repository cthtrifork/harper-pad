package protocol

import (
	"encoding/json"
	"errors"
	"regexp"
	"unicode/utf8"
)

const (
	// MaxContentBytes is the largest draft text, the same 5 MB the app enforces (internal/store.MaxContentBytes).
	MaxContentBytes = 5 << 20
	// MaxDataBytes is the largest `data` string a PUT may carry: the blob is JSON, so escaping makes it larger than the text. It
	// matches the CHECK on docs.data, which is the last line of defence.
	MaxDataBytes = 8 << 20
	// MaxBodyBytes is the request body limit of a PUT: the data plus the envelope around it.
	MaxBodyBytes = MaxDataBytes + 4<<10

	// DefaultListLimit and MaxListLimit bound a page of GET /docs.
	DefaultListLimit = 500
	MaxListLimit     = 1000

	// IDPattern is the shape of a draft id: 16 bytes as 32 lower-case hex characters.
	IDPattern = "^[0-9a-f]{32}$"
)

var idRE = regexp.MustCompile(IDPattern)

// ValidID reports whether id is a draft id.
func ValidID(id string) bool { return idRE.MatchString(id) }

// Known draft formats, as in the app.
const (
	FormatMarkdown = "markdown"
	FormatText     = "text"
)

// Errors of ValidateData. ErrTooLarge is a 413, ErrInvalid a 422.
var (
	ErrTooLarge = errors.New("draft too large")
	ErrInvalid  = errors.New("invalid draft")
)

// blob is the draft as the app stores it: {"v":1,"format":"markdown","content":"..."} (docs/storage.md).
type blob struct {
	V       int     `json:"v"`
	Format  string  `json:"format"`
	Content *string `json:"content"`
}

// ValidateData checks the `data` of a live draft: valid UTF-8, within the limits, a JSON object of version 1 with a known format
// and a content string of at most MaxContentBytes. The server stores the string as it came; it only checks that it is a draft.
func ValidateData(data string) error {
	if len(data) > MaxDataBytes {
		return ErrTooLarge
	}
	if !utf8.ValidString(data) {
		return errors.Join(ErrInvalid, errors.New("data is not valid UTF-8"))
	}
	var b blob
	if err := json.Unmarshal([]byte(data), &b); err != nil {
		return errors.Join(ErrInvalid, errors.New("data is not a draft"))
	}
	if b.V != 1 {
		return errors.Join(ErrInvalid, errors.New("unknown draft version"))
	}
	if b.Format != FormatMarkdown && b.Format != FormatText {
		return errors.Join(ErrInvalid, errors.New("unknown format"))
	}
	if b.Content == nil {
		return errors.Join(ErrInvalid, errors.New("draft has no content"))
	}
	if len(*b.Content) > MaxContentBytes {
		return ErrTooLarge
	}
	return nil
}
