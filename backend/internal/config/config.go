package config

import (
	"fmt"
	"net/url"
	"os"
)

// Common is what both commands read from the environment.
type Common struct {
	// ListenAddr is LISTEN_ADDR, a host:port for net.Listen.
	ListenAddr string
	// DatabaseURL is DATABASE_URL, or empty: the standard libpq variables (PGHOST, PGSSLCERT, ...) are then read by the driver,
	// which is how the cluster configures client-certificate login.
	DatabaseURL string
	// MetricsAddr is METRICS_ADDR, where /metrics is served on its own listener; empty turns metrics off.
	MetricsAddr string
}

// Sync is the environment of harper-pad-sync.
type Sync struct {
	Common
	// PublicURL is PUBLIC_URL, the https origin clients use. The scheme comes from here, never from request headers.
	PublicURL string
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
	return c, nil
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
