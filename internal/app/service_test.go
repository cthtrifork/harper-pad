package app

import "testing"

func TestEcho(t *testing.T) {
	if got := NewPadService().Echo("  hi \n"); got != "hi" {
		t.Fatalf("Echo = %q, want %q", got, "hi")
	}
}
