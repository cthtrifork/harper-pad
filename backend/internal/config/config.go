package config

import (
	"fmt"
	"net/url"
	"os"
	"strings"
)

// Common is what both commands read from the environment.
type Common struct {
	// ListenAddr is LISTEN_ADDR, a host:port for net.Listen.
	ListenAddr string
	// DatabaseURL is DATABASE_URL, or empty: the standard libpq variables (PGHOST, PGSSLCERT, ...) are then read by the driver,
	// which is how the cluster configures client-certificate login.
	DatabaseURL string
	// MetricsAddr is METRICS_ADDR, where /metrics, /healthz and /readyz are served on their own listener, so none of them is on the
	// public port; empty turns metrics off and puts the probes on the public port.
	MetricsAddr string
}

// Sync is the environment of harper-pad-sync.
type Sync struct {
	Common
	// PublicURL is PUBLIC_URL, the https origin clients use. The scheme comes from here, never from request headers.
	PublicURL string
	// AllowedOrigins is CORS_ALLOWED_ORIGINS, a comma-separated list of exact origins (https://app.example.org) that browsers may
	// call the API from: the Pages site and the desktop app's webview. Never "*". Empty allows none.
	AllowedOrigins []string
}

// Admin is the environment of harper-pad-admin.
type Admin struct {
	Common
	// SyncPublicURL is SYNC_PUBLIC_URL, the sync service's public https origin: enrollment URLs are built from it.
	SyncPublicURL string
}

func common(defaultAddr, defaultMetricsAddr string) Common {
	metrics, ok := os.LookupEnv("METRICS_ADDR")
	if !ok {
		metrics = defaultMetricsAddr
	}
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = defaultAddr
	}
	return Common{ListenAddr: addr, DatabaseURL: os.Getenv("DATABASE_URL"), MetricsAddr: metrics}
}

// LoadSync reads the environment of harper-pad-sync. It listens on :9000 by default, the port the cluster manifests use, and
// serves metrics on :9102.
func LoadSync() (Sync, error) {
	c := Sync{Common: common(":9000", ":9102"), PublicURL: os.Getenv("PUBLIC_URL")}
	if err := validateURL("PUBLIC_URL", c.PublicURL); err != nil {
		return Sync{}, err
	}
	origins, err := parseOrigins(os.Getenv("CORS_ALLOWED_ORIGINS"))
	if err != nil {
		return Sync{}, err
	}
	c.AllowedOrigins = origins
	return c, nil
}

// parseOrigins splits a comma-separated list of origins. Each must be scheme://host[:port] with nothing after it: the browser's
// Origin header is compared with these strings exactly, so a trailing slash or a path would never match. Any scheme is allowed
// because a desktop webview may use its own (the real value is read from the CORS log line, see syncapi); "*" has no host and
// is refused.
func parseOrigins(list string) ([]string, error) {
	var out []string
	for _, o := range strings.Split(list, ",") {
		o = strings.TrimSpace(o)
		if o == "" {
			continue
		}
		u, err := url.Parse(o)
		if err != nil || u.Host == "" || u.Scheme == "" || u.Path != "" || u.RawQuery != "" || u.Fragment != "" || u.User != nil {
			return nil, fmt.Errorf("CORS_ALLOWED_ORIGINS: %q is not an origin (scheme://host[:port])", o)
		}
		out = append(out, o)
	}
	return out, nil
}

// LoadAdmin reads the environment of harper-pad-admin. It listens on loopback by default: in the cluster only its
// cloudflared sidecar may reach it, so its metrics are off unless METRICS_ADDR is set.
func LoadAdmin() (Admin, error) {
	c := Admin{Common: common("127.0.0.1:9001", ""), SyncPublicURL: os.Getenv("SYNC_PUBLIC_URL")}
	if err := validateURL("SYNC_PUBLIC_URL", c.SyncPublicURL); err != nil {
		return Admin{}, err
	}
	return c, nil
}

func validateURL(name, raw string) error {
	if raw == "" {
		return fmt.Errorf("%s is required", name)
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return fmt.Errorf("%s %q is not a URL", name, raw)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("%s must be an https URL, got scheme %q", name, u.Scheme)
	}
	return nil
}
