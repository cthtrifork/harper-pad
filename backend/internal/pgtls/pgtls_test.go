package pgtls

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"math/big"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

// writePair writes a self-signed client certificate and its key, and returns its serial number.
func writePair(t *testing.T, certFile, keyFile string, serial int64) {
	t.Helper()
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	tmpl := &x509.Certificate{
		SerialNumber: big.NewInt(serial),
		Subject:      pkix.Name{CommonName: "harper_sync"},
		NotBefore:    time.Now().Add(-time.Hour),
		NotAfter:     time.Now().Add(time.Hour),
		ExtKeyUsage:  []x509.ExtKeyUsage{x509.ExtKeyUsageClientAuth},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		t.Fatal(err)
	}
	keyDER, err := x509.MarshalECPrivateKey(key)
	if err != nil {
		t.Fatal(err)
	}
	write := func(path, typ string, b []byte) {
		if err := os.WriteFile(path, pem.EncodeToMemory(&pem.Block{Type: typ, Bytes: b}), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	write(certFile, "CERTIFICATE", der)
	write(keyFile, "EC PRIVATE KEY", keyDER)
}

func serial(t *testing.T, c *tls.Config) int64 {
	t.Helper()
	cert, err := c.GetClientCertificate(&tls.CertificateRequestInfo{})
	if err != nil {
		t.Fatal(err)
	}
	leaf, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatal(err)
	}
	return leaf.SerialNumber.Int64()
}

func TestApplyReloadsRenewedCertificate(t *testing.T) {
	dir := t.TempDir()
	certFile, keyFile := filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")
	writePair(t, certFile, keyFile, 1)

	cc := &pgx.ConnConfig{Config: pgconn.Config{TLSConfig: &tls.Config{ServerName: "db"}}}
	cc.Fallbacks = append(cc.Fallbacks, &pgconn.FallbackConfig{TLSConfig: &tls.Config{ServerName: "db"}})
	if err := Apply(cc, certFile, keyFile); err != nil {
		t.Fatal(err)
	}
	if got := serial(t, cc.TLSConfig); got != 1 {
		t.Fatalf("serial = %d, want 1", got)
	}

	writePair(t, certFile, keyFile, 2)
	later := time.Now().Add(time.Minute)
	for _, f := range []string{certFile, keyFile} {
		if err := os.Chtimes(f, later, later); err != nil {
			t.Fatal(err)
		}
	}
	if got := serial(t, cc.TLSConfig); got != 2 {
		t.Fatalf("after renewal serial = %d, want 2", got)
	}
	if got := serial(t, cc.Fallbacks[0].TLSConfig); got != 2 {
		t.Fatalf("fallback serial = %d, want 2", got)
	}
}

func TestApplyKeepsCertificateWhenFilesAreBroken(t *testing.T) {
	dir := t.TempDir()
	certFile, keyFile := filepath.Join(dir, "tls.crt"), filepath.Join(dir, "tls.key")
	writePair(t, certFile, keyFile, 1)
	cc := &pgx.ConnConfig{Config: pgconn.Config{TLSConfig: &tls.Config{}}}
	if err := Apply(cc, certFile, keyFile); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(certFile, []byte("half written"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := serial(t, cc.TLSConfig); got != 1 {
		t.Fatalf("serial = %d, want the previous certificate (1)", got)
	}
}

func TestApplyFailsAtStartWhenFilesAreMissing(t *testing.T) {
	cc := &pgx.ConnConfig{Config: pgconn.Config{TLSConfig: &tls.Config{}}}
	if err := Apply(cc, "/nonexistent/tls.crt", "/nonexistent/tls.key"); err == nil {
		t.Fatal("want an error for a missing certificate")
	}
}

func TestApplyIgnoresPlainConnections(t *testing.T) {
	if err := Apply(&pgx.ConnConfig{}, "/nonexistent/tls.crt", "/nonexistent/tls.key"); err != nil {
		t.Fatalf("sslmode=disable: %v", err)
	}
	if err := Apply(&pgx.ConnConfig{Config: pgconn.Config{TLSConfig: &tls.Config{}}}, "", ""); err != nil {
		t.Fatalf("no client certificate: %v", err)
	}
}

func TestFiles(t *testing.T) {
	t.Setenv("PGSSLCERT", "/env/crt")
	t.Setenv("PGSSLKEY", "/env/key")
	if c, k := Files(""); c != "/env/crt" || k != "/env/key" {
		t.Fatalf("env: %q %q", c, k)
	}
	if c, k := Files("postgres://u@h/db?sslcert=/url/crt&sslkey=/url/key"); c != "/url/crt" || k != "/url/key" {
		t.Fatalf("url: %q %q", c, k)
	}
}
