package syncapi

import (
	"encoding/json"
	"errors"
	"unicode/utf8"

	"github.com/cthtrifork/harper-pad/backend/internal/store"
)

// maxBody is a PUT body: the largest text the database takes plus what wraps it. It only keeps a huge body from being read; the size
// limit itself is the CHECK on docs.data, and store.ErrTooLarge is how it comes back.
const maxBody = store.MaxDocData + 4<<10

var errInvalid = errors.New("invalid draft")

// validateData checks that the `data` of a live draft is the app's blob, {"v":1,"format":"markdown"|"text","content":"..."}, and
// valid UTF-8. The size limit is the database's. The server stores the string as it came.
func validateData(data string) error {
	var b struct {
		V       int     `json:"v"`
		Format  string  `json:"format"`
		Content *string `json:"content"`
	}
	if !utf8.ValidString(data) || json.Unmarshal([]byte(data), &b) != nil || b.V != 1 || b.Content == nil ||
		(b.Format != "markdown" && b.Format != "text") {
		return errInvalid
	}
	return nil
}
