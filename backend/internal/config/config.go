package config

import (
	"errors"
	"fmt"
	"net/url"
	"os"
)

// Common is what both commands read from the environment.
type Common struct {
	// ListenAddr is LISTEN_ADDR, a host:port for net.Listen.
	ListenAddr string
	// DatabaseURL is DATABASE_URL, or empty: the standard libpq variables (PGHOST, PGSSLCERT, ...) are then read by the driver,
	// which is how the cluster configures client-certificate login (see internal/pgtls for the renewal).
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
	if err := validatePublicURL(c.PublicURL); err != nil {
		return Sync{}, err
	}
	return c, nil
}

// LoadAdmin reads the environment of harper-pad-admin. It listens on loopback by default: in the cluster only its
// cloudflared sidecar may reach it, so its metrics are off unless METRICS_ADDR is set.
func LoadAdmin() (Admin, error) {
	return Admin{Common: common("127.0.0.1:9001", "")}, nil
}

func validatePublicURL(raw string) error {
	if raw == "" {
		return errors.New("PUBLIC_URL is required")
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return fmt.Errorf("PUBLIC_URL %q is not a URL", raw)
	}
	if u.Scheme != "https" {
		return fmt.Errorf("PUBLIC_URL must be an https URL, got scheme %q", u.Scheme)
	}
	return nil
}
