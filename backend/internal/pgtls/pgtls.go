// Package pgtls makes the PostgreSQL client certificate follow cert-manager's renewals without a restart. See docs/sync.md,
// "Database access".
//
// pgx reads PGSSLCERT and PGSSLKEY once, when the configuration is parsed, and keeps that certificate for the life of the
// process. cert-manager renews the certificate in place, so Apply replaces it with a callback that loads the files again when
// they change. The next connection the pool opens then presents the renewed certificate; established connections are not
// affected, and MaxConnLifetime retires them.
package pgtls

import (
	"crypto/tls"
	"fmt"
	"net/url"
	"os"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
)

// Files returns the client certificate and key paths: the sslcert and sslkey parameters of databaseURL, else PGSSLCERT and
// PGSSLKEY. Both are empty when no client certificate is configured.
func Files(databaseURL string) (cert, key string) {
	if u, err := url.Parse(databaseURL); err == nil && u.Scheme != "" {
		q := u.Query()
		cert, key = q.Get("sslcert"), q.Get("sslkey")
	}
	if cert == "" {
		cert = os.Getenv("PGSSLCERT")
	}
	if key == "" {
		key = os.Getenv("PGSSLKEY")
	}
	return cert, key
}

// Apply makes cc present the certificate in certFile and keyFile, reloading them when either file changes. It does nothing
// when certFile or keyFile is empty or cc has no TLS configuration (sslmode=disable).
func Apply(cc *pgx.ConnConfig, certFile, keyFile string) error {
	if certFile == "" || keyFile == "" || cc.TLSConfig == nil {
		return nil
	}
	r := &reloader{certFile: certFile, keyFile: keyFile}
	if _, err := r.get(nil); err != nil {
		return err
	}
	set := func(c *tls.Config) {
		c.Certificates = nil
		c.GetClientCertificate = r.get
	}
	set(cc.TLSConfig)
	for _, f := range cc.Fallbacks {
		if f.TLSConfig != nil {
			set(f.TLSConfig)
		}
	}
	return nil
}

type reloader struct {
	certFile, keyFile string

	mu                sync.Mutex
	cert              *tls.Certificate
	certMod, keyMod   time.Time
	certSize, keySize int64
}

// get is a tls.Config.GetClientCertificate. A failed reload keeps the certificate in use: cert-manager replaces the files one
// after the other, so the pair can be briefly inconsistent, and the next connection reads it again.
func (r *reloader) get(*tls.CertificateRequestInfo) (*tls.Certificate, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ci, cerr := os.Stat(r.certFile)
	ki, kerr := os.Stat(r.keyFile)
	if cerr == nil && kerr == nil && r.cert != nil &&
		ci.ModTime().Equal(r.certMod) && ki.ModTime().Equal(r.keyMod) && ci.Size() == r.certSize && ki.Size() == r.keySize {
		return r.cert, nil
	}
	pair, err := tls.LoadX509KeyPair(r.certFile, r.keyFile)
	if err != nil {
		if r.cert != nil {
			return r.cert, nil
		}
		return nil, fmt.Errorf("client certificate: %w", err)
	}
	r.cert = &pair
	if cerr == nil && kerr == nil {
		r.certMod, r.keyMod, r.certSize, r.keySize = ci.ModTime(), ki.ModTime(), ci.Size(), ki.Size()
	}
	return r.cert, nil
}
