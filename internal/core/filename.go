package core

import (
	"strings"
	"unicode"
)

// SuggestName is the file name offered when a draft is saved: its title with only letters, numbers and ._- and spaces kept, trimmed, at most 60
// characters, with the extension of its format.
func SuggestName(title, format string) string {
	name := strings.Trim(strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsNumber(r) || strings.ContainsRune("._ -", r) {
			return r
		}
		return -1
	}, title), " .-")
	if name == "" {
		name = "Untitled"
	}
	if r := []rune(name); len(r) > 60 {
		name = strings.TrimSpace(string(r[:60]))
	}
	if format == "text" {
		return name + ".txt"
	}
	return name + ".md"
}
