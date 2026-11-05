// Command vendorhtmx vendors one htmx.org release into the admin UI: the minified build and its licence, taken
// from the npm tarball and checked against the integrity hash the npm registry publishes for that version.
// It runs through `go generate` (see internal/admin/handler.go), where Renovate keeps the version current.
package main

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha512"
	"encoding/base64"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
)

const registry = "https://registry.npmjs.org/htmx.org"

var plainVersion = regexp.MustCompile(`^[0-9]+\.[0-9]+\.[0-9]+$`)

func main() {
	version := flag.String("version", "", "htmx.org version, x.y.z")
	dir := flag.String("dir", "", "directory that receives htmx.min.js and htmx.LICENSE.txt")
	flag.Parse()
	if err := run(*version, *dir); err != nil {
		fmt.Fprintln(os.Stderr, "vendorhtmx:", err)
		os.Exit(1)
	}
}

func run(version, dir string) error {
	if !plainVersion.MatchString(version) || dir == "" {
		return fmt.Errorf("need -version x.y.z and -dir")
	}
	var meta struct {
		Dist struct {
			Integrity string `json:"integrity"`
		} `json:"dist"`
	}
	body, err := get(registry + "/" + version)
	if err != nil {
		return err
	}
	if err := json.Unmarshal(body, &meta); err != nil {
		return err
	}
	tarball, err := get(registry + "/-/htmx.org-" + version + ".tgz")
	if err != nil {
		return err
	}
	sum := sha512.Sum512(tarball)
	if got := "sha512-" + base64.StdEncoding.EncodeToString(sum[:]); meta.Dist.Integrity == "" || got != meta.Dist.Integrity {
		return fmt.Errorf("integrity mismatch for htmx.org %s", version)
	}
	files, err := extract(tarball, map[string]string{
		"package/dist/htmx.min.js": "htmx.min.js",
		"package/LICENSE":          "htmx.LICENSE.txt",
	})
	if err != nil {
		return err
	}
	for name, data := range files {
		if err := os.WriteFile(filepath.Join(dir, name), data, 0o644); err != nil {
			return err
		}
	}
	fmt.Printf("htmx %s vendored into %s\n", version, dir)
	return nil
}

func get(url string) ([]byte, error) {
	resp, err := http.Get(url) //nolint:gosec // a fixed registry host plus a validated version
	if err != nil {
		return nil, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GET %s: %s", url, resp.Status)
	}
	return io.ReadAll(resp.Body)
}

// extract returns the tarball entries named in want, keyed by the file name they are written under.
func extract(tgz []byte, want map[string]string) (map[string][]byte, error) {
	zr, err := gzip.NewReader(bytes.NewReader(tgz))
	if err != nil {
		return nil, err
	}
	tr := tar.NewReader(zr)
	out := map[string][]byte{}
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, err
		}
		if name, ok := want[h.Name]; ok {
			if out[name], err = io.ReadAll(tr); err != nil {
				return nil, err
			}
		}
	}
	for _, name := range want {
		if out[name] == nil {
			return nil, fmt.Errorf("%s not in the tarball", name)
		}
	}
	return out, nil
}
