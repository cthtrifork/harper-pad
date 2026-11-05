package config

import (
	"strings"
	"testing"
)

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

func TestLoadSyncOrigins(t *testing.T) {
	t.Setenv("PUBLIC_URL", "https://sync.example.org")
	tests := []struct {
		list    string
		want    []string
		wantErr bool
	}{
		{"", nil, false},
		{"https://app.example.org", []string{"https://app.example.org"}, false},
		{" https://a.example.org , http://wails.localhost,wails://wails ,", []string{"https://a.example.org", "http://wails.localhost", "wails://wails"}, false},
		{"*", nil, true},
		{"https://app.example.org/", nil, true},
		{"https://app.example.org/path", nil, true},
		{"app.example.org", nil, true},
		{"https://user@app.example.org", nil, true},
	}
	for _, tt := range tests {
		t.Setenv("CORS_ALLOWED_ORIGINS", tt.list)
		c, err := LoadSync()
		if (err != nil) != tt.wantErr {
			t.Errorf("%q: err = %v, wantErr %v", tt.list, err, tt.wantErr)
			continue
		}
		if err == nil && strings.Join(c.AllowedOrigins, "|") != strings.Join(tt.want, "|") {
			t.Errorf("%q: origins = %v, want %v", tt.list, c.AllowedOrigins, tt.want)
		}
	}
}
