package syncapi

import (
	"errors"
	"testing"
)

func TestValidateData(t *testing.T) {
	tests := []struct {
		name string
		data string
		want error
	}{
		{"markdown", `{"v":1,"format":"markdown","content":"# hi"}`, nil},
		{"text, empty content", `{"v":1,"format":"text","content":""}`, nil},
		{"extra members are kept", `{"v":1,"format":"text","content":"x","rev":3}`, nil},
		{"empty", ``, errInvalid},
		{"not json", `hello`, errInvalid},
		{"an array", `[]`, errInvalid},
		{"version 2", `{"v":2,"format":"text","content":"x"}`, errInvalid},
		{"unknown format", `{"v":1,"format":"html","content":"x"}`, errInvalid},
		{"no content", `{"v":1,"format":"text"}`, errInvalid},
		{"content is not a string", `{"v":1,"format":"text","content":5}`, errInvalid},
		{"invalid utf-8", "{\"v\":1,\"format\":\"text\",\"content\":\"\xff\"}", errInvalid},
	}
	for _, tc := range tests {
		if got := validateData(tc.data); !errors.Is(got, tc.want) {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}
