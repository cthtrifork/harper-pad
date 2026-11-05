package syncapi

import (
	"encoding/json"
	"errors"
	"unicode/utf8"
)

const (
	// maxData is the one size limit of a draft: the `data` string, as the CHECK on docs.data. The app enforces its own 5 MB on the text.
	maxData = 8 << 20
	// maxBody is a PUT body: the data plus what wraps it.
	maxBody = maxData + 4<<10

	defaultListLimit = 500
)

var (
	errTooLarge = errors.New("draft too large")
	errInvalid  = errors.New("invalid draft")
)

// validateData checks that the `data` of a live draft is the app's blob, {"v":1,"format":"markdown"|"text","content":"..."}, and
// within the limit. The server stores the string as it came.
func validateData(data string) error {
	if len(data) > maxData {
		return errTooLarge
	}
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
