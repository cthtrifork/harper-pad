//go:build !production

package app

import "testing"

func TestDemoMode(t *testing.T) {
	svc := NewPadService()
	t.Setenv(demoFlag, "")
	if got := svc.DemoMode(); got != "" {
		t.Errorf("DemoMode() = %q with the flag unset, want empty", got)
	}
	t.Setenv(demoFlag, "1")
	if got := svc.DemoMode(); got == "" {
		t.Error("DemoMode() is empty with the flag set")
	}
}
