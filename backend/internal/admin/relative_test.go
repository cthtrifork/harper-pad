package admin

import (
	"testing"
	"time"
)

var t0 = time.Date(2026, 11, 4, 12, 0, 0, 0, time.UTC)

func TestRelativeTimes(t *testing.T) {
	ago := func(d time.Duration) time.Time { return t0.Add(-d) }
	for _, tt := range []struct {
		got, want string
	}{
		{lastSeen(t0, time.Time{}), "never"},
		{lastSeen(t0, ago(10*time.Second)), "just now"},
		{lastSeen(t0, ago(5*time.Minute)), "5 min ago"},
		{lastSeen(t0, ago(3*time.Hour)), "3 h ago"},
		{lastSeen(t0, ago(27*time.Hour)), "Yesterday, 09:00"},
		{lastSeen(t0, ago(5*24*time.Hour)), "30 Oct 2026, 12:00"},
		{lastSeen(t0, ago(37*24*time.Hour)), "28 Sep 2026 (37 days ago)"},
		{countdown(t0, t0.Add(14*time.Minute+52*time.Second)), "in 14:52"},
		{countdown(t0, t0.Add(-time.Second)), "expired"},
	} {
		if tt.got != tt.want {
			t.Errorf("got %q, want %q", tt.got, tt.want)
		}
	}
}
