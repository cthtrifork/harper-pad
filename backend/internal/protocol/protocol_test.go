package protocol

import (
	"errors"
	"strings"
	"testing"
)

func TestValidateData(t *testing.T) {
	tests := []struct {
		name string
		data string
		want error // nil, ErrInvalid or ErrTooLarge
	}{
		{"markdown", `{"v":1,"format":"markdown","content":"# hi"}`, nil},
		{"text, empty content", `{"v":1,"format":"text","content":""}`, nil},
		{"extra members are kept", `{"v":1,"format":"text","content":"x","rev":3}`, nil},
		{"empty", ``, ErrInvalid},
		{"not json", `hello`, ErrInvalid},
		{"an array", `[]`, ErrInvalid},
		{"version 2", `{"v":2,"format":"text","content":"x"}`, ErrInvalid},
		{"no version", `{"format":"text","content":"x"}`, ErrInvalid},
		{"unknown format", `{"v":1,"format":"html","content":"x"}`, ErrInvalid},
		{"no format", `{"v":1,"content":"x"}`, ErrInvalid},
		{"no content", `{"v":1,"format":"text"}`, ErrInvalid},
		{"content is not a string", `{"v":1,"format":"text","content":5}`, ErrInvalid},
		{"invalid utf-8", "{\"v\":1,\"format\":\"text\",\"content\":\"\xff\"}", ErrInvalid},
		{"content at the limit", `{"v":1,"format":"text","content":"` + strings.Repeat("x", MaxContentBytes) + `"}`, nil},
		{"content over the limit", `{"v":1,"format":"text","content":"` + strings.Repeat("x", MaxContentBytes+1) + `"}`, ErrTooLarge},
		{"data over the backstop", strings.Repeat(" ", MaxDataBytes+1), ErrTooLarge},
	}
	for _, tc := range tests {
		got := ValidateData(tc.data)
		if !errors.Is(got, tc.want) && !(tc.want == nil && got == nil) {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestValidID(t *testing.T) {
	for id, want := range map[string]bool{
		"0123456789abcdef0123456789abcdef":   true,
		"0123456789ABCDEF0123456789abcdef":   false,
		"0123456789abcdef0123456789abcde":    false,
		"0123456789abcdef0123456789abcdef0":  false,
		"0123456789abcdef0123456789abcdeg":   false,
		"":                                   false,
		"0123456789abcdef0123456789abcdef\n": false,
	} {
		if ValidID(id) != want {
			t.Errorf("ValidID(%q) = %v", id, !want)
		}
	}
}
