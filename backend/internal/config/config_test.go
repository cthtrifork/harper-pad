package config

import "testing"

func TestLoadSync(t *testing.T) {
	tests := []struct {
		name, publicURL string
		wantErr         bool
	}{
		{"https", "https://sync.example.org", false},
		{"missing", "", true},
		{"http", "http://sync.example.org", true},
		{"no host", "https://", true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("PUBLIC_URL", tt.publicURL)
			c, err := LoadSync()
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
			}
			if err == nil && c.ListenAddr != ":9000" {
				t.Errorf("default ListenAddr = %q, want :9000", c.ListenAddr)
			}
		})
	}
}

func TestLoadAdminSyncPublicURL(t *testing.T) {
	for url, wantErr := range map[string]bool{"https://sync.example.org": false, "": true, "http://sync.example.org": true} {
		t.Setenv("SYNC_PUBLIC_URL", url)
		if _, err := LoadAdmin(); (err != nil) != wantErr {
			t.Errorf("SYNC_PUBLIC_URL=%q: err = %v, wantErr %v", url, err, wantErr)
		}
	}
}

func TestLoadAdminDefaultsToLoopback(t *testing.T) {
	t.Setenv("SYNC_PUBLIC_URL", "https://sync.example.org")
	t.Setenv("LISTEN_ADDR", "")
	c, err := LoadAdmin()
	if err != nil {
		t.Fatal(err)
	}
	if c.ListenAddr != "127.0.0.1:9001" {
		t.Errorf("ListenAddr = %q", c.ListenAddr)
	}
}
