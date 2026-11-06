package admin

import (
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

func TestCountdown(t *testing.T) {
	for _, tt := range []struct {
		got, want string
	}{
		{countdown(t0, t0.Add(14*time.Minute+52*time.Second)), "in 14:52"},
		{countdown(t0, t0.Add(-time.Second)), "expired"},
	} {
		if tt.got != tt.want {
			t.Errorf("got %q, want %q", tt.got, tt.want)
		}
	}
}
