package selfupdate

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
)

func TestEnabled(t *testing.T) {
	for v, want := range map[string]bool{
		"v0.1.0":               true,
		"0.1.0":                false, // release tags always carry the leading v
		"v1.2.3-rc.1":          true,
		"v0.0.0-dryrun.abc123": true, // the release workflow's dry-run version is a valid semver
		"v1.2.3+build5":        true,
		"dev":                  false, // the default for `go run` / `go build`
		"":                     false,
		"ci-0123456":           false, // CI binaries
		"latest":               false,
		"v1.2.3;rm -rf":        false,
	} {
		if got := Enabled(v); got != want {
			t.Errorf("Enabled(%q) = %v, want %v", v, got, want)
		}
	}
}

func TestMatchAsset(t *testing.T) {
	linux := updater.CheckRequest{Platform: "linux", Arch: "amd64"}
	// GitHub lists assets in upload order; the tarball can come first.
	assets := []github.ReleaseAsset{
		{Name: "harper-pad_v0.2.0_linux_amd64.tar.gz"},
		{Name: "harper-pad_v0.2.0_amd64.deb"},
		{Name: "harper-pad_v0.2.0_x86_64.rpm"},
		{Name: "SHA256SUMS"},
		{Name: "harper-pad_linux_amd64"},
	}
	if got := MatchAsset(linux, assets); got != 4 {
		t.Errorf("picked index %d (%s), want the raw binary at 4", got, assets[max(got, 0)].Name)
	}
	if got := MatchAsset(updater.CheckRequest{Platform: "linux", Arch: "arm64"}, assets); got != -1 {
		t.Errorf("arm64 matched %d, but none is published", got)
	}
	if got := MatchAsset(updater.CheckRequest{Platform: "windows", Arch: "amd64"}, assets); got != -1 {
		t.Errorf("windows matched %d", got)
	}
	// With only the multi-file tarball and the packages the update must fail with "no asset", not install it.
	if got := MatchAsset(linux, assets[:4]); got != -1 {
		t.Errorf("a tarball-only release matched %d", got)
	}
}

// fakeGitHub serves one release in the shape of the GitHub REST API.
type fakeGitHub struct {
	*httptest.Server
}

func newFakeGitHub(t *testing.T, tag string, files map[string][]byte, order []string) *fakeGitHub {
	t.Helper()
	mux := http.NewServeMux()
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)
	mux.HandleFunc("/repos/"+Repository+"/releases/latest", func(w http.ResponseWriter, r *http.Request) {
		type asset struct {
			ID                 int    `json:"id"`
			Name               string `json:"name"`
			ContentType        string `json:"content_type"`
			Size               int    `json:"size"`
			URL                string `json:"url"` // the API asset URL the Wails v3.1 provider downloads from
			BrowserDownloadURL string `json:"browser_download_url"`
		}
		var assets []asset
		for i, name := range order {
			assets = append(assets, asset{i + 1, name, "application/octet-stream", len(files[name]), srv.URL + "/dl/" + name, srv.URL + "/dl/" + name})
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"tag_name": tag, "name": tag, "body": "notes", "html_url": srv.URL, "assets": assets,
		})
	})
	mux.HandleFunc("/dl/", func(w http.ResponseWriter, r *http.Request) {
		b, ok := files[strings.TrimPrefix(r.URL.Path, "/dl/")]
		if !ok {
			http.NotFound(w, r)
			return
		}
		_, _ = w.Write(b)
	})
	return &fakeGitHub{srv}
}

// packageRelease lays out a stand-in release the way release.yml does (raw binary,
// tarball, SHA256SUMS) and returns its files, in the order a release would list them.
func packageRelease(t *testing.T, version string) (files map[string][]byte, order []string, binary []byte) {
	t.Helper()
	if runtime.GOOS != "linux" {
		t.Skip("the release is packaged on Linux")
	}
	binary = make([]byte, 4096)
	_, _ = rand.Read(binary)
	dir := t.TempDir()
	out := filepath.Join(dir, "dist")
	if err := os.MkdirAll(out, 0o755); err != nil {
		t.Fatal(err)
	}
	raw := "harper-pad_linux_amd64"
	archive := "harper-pad_" + version + "_linux_amd64.tar.gz"
	var sums strings.Builder
	for _, f := range []struct {
		name string
		data []byte
	}{{raw, binary}, {archive, []byte("stand-in tarball")}} {
		if err := os.WriteFile(filepath.Join(out, f.name), f.data, 0o755); err != nil {
			t.Fatal(err)
		}
		sum := sha256.Sum256(f.data)
		fmt.Fprintf(&sums, "%x  %s\n", sum, f.name)
	}
	if err := os.WriteFile(filepath.Join(out, "SHA256SUMS"), []byte(sums.String()), 0o644); err != nil {
		t.Fatal(err)
	}
	entries, err := os.ReadDir(out)
	if err != nil {
		t.Fatal(err)
	}
	files = map[string][]byte{}
	for _, e := range entries {
		b, _ := os.ReadFile(filepath.Join(out, e.Name()))
		files[e.Name()] = b
	}
	// Put the tarball first: the default matcher would take it, ours must not.
	for name := range files {
		if strings.HasSuffix(name, ".tar.gz") {
			order = append([]string{name}, order...)
		} else {
			order = append(order, name)
		}
	}
	return files, order, binary
}

func check(t *testing.T, srv *fakeGitHub, current string) (*updater.Release, error) {
	t.Helper()
	p, err := NewProvider(srv.URL)
	if err != nil {
		t.Fatal(err)
	}
	return p.Check(context.Background(), updater.CheckRequest{CurrentVersion: current, Platform: "linux", Arch: "amd64"})
}

// The release workflow's output must be exactly what the updater can consume.
func TestReleaseLayoutIsInstallable(t *testing.T) {
	files, order, binary := packageRelease(t, "v0.2.0")
	srv := newFakeGitHub(t, "v0.2.0", files, order)

	rel, err := check(t, srv, "v0.1.0")
	if err != nil || rel == nil {
		t.Fatalf("Check: %v %v", rel, err)
	}
	if rel.Version != "0.2.0" || rel.Artifact.Filename != "harper-pad_linux_amd64" {
		t.Fatalf("release %s picked asset %q", rel.Version, rel.Artifact.Filename)
	}
	want := sha256.Sum256(binary)
	if rel.Verification == nil || string(rel.Verification.Digest) != string(want[:]) {
		t.Fatalf("digest does not match the binary: %+v", rel.Verification)
	}

	// Download delivers the raw binary byte for byte, which is what gets swapped in.
	p, _ := NewProvider(srv.URL)
	var got strings.Builder
	if err := p.Download(context.Background(), rel, &got, func(int64, int64) {}); err != nil {
		t.Fatal(err)
	}
	if got.String() != string(binary) {
		t.Error("downloaded bytes differ from the packaged binary")
	}

	// The tarball is for people: several entries, so the updater could not install it.
	var tarball string
	for name := range files {
		if strings.HasSuffix(name, ".tar.gz") {
			tarball = name
		}
	}
	if !strings.Contains(string(files["SHA256SUMS"]), tarball) {
		t.Errorf("SHA256SUMS should also list %s", tarball)
	}
}

func TestVersionComparison(t *testing.T) {
	files, order, _ := packageRelease(t, "v0.2.0")
	srv := newFakeGitHub(t, "v0.2.0", files, order)
	for current, wantUpdate := range map[string]bool{
		"v0.1.0":      true,
		"0.1.9":       true, // no leading v
		"v0.2.0-rc.1": true, // a release candidate is older than the release
		"v0.2.0":      false,
		"v1.0.0":      false, // never downgrade
	} {
		rel, err := check(t, srv, current)
		if err != nil {
			t.Errorf("current %s: %v", current, err)
			continue
		}
		if (rel != nil) != wantUpdate {
			t.Errorf("current %s: update offered = %v, want %v", current, rel != nil, wantUpdate)
		}
	}
}

// A release the updater could not verify must be refused, not installed unchecked.
func TestUnverifiedReleaseIsRefused(t *testing.T) {
	files, order, _ := packageRelease(t, "v0.2.0")

	t.Run("no SHA256SUMS in the release", func(t *testing.T) {
		f := map[string][]byte{}
		var o []string
		for _, n := range order {
			if n != "SHA256SUMS" {
				f[n], o = files[n], append(o, n)
			}
		}
		_, err := check(t, newFakeGitHub(t, "v0.2.0", f, o), "v0.1.0")
		if !errors.Is(err, ErrUnverified) {
			t.Fatalf("err = %v, want ErrUnverified", err)
		}
	})

	t.Run("SHA256SUMS does not list the binary", func(t *testing.T) {
		f := map[string][]byte{}
		for k, v := range files {
			f[k] = v
		}
		f["SHA256SUMS"] = []byte("0000000000000000000000000000000000000000000000000000000000000000  something_else\n")
		_, err := check(t, newFakeGitHub(t, "v0.2.0", f, order), "v0.1.0")
		if !errors.Is(err, ErrUnverified) {
			t.Fatalf("err = %v, want ErrUnverified", err)
		}
	})

	t.Run("up to date is not an error even without checksums", func(t *testing.T) {
		rel, err := check(t, newFakeGitHub(t, "v0.1.0", map[string][]byte{"harper-pad_linux_amd64": {1}}, []string{"harper-pad_linux_amd64"}), "v0.1.0")
		if err != nil || rel != nil {
			t.Fatalf("got %v, %v", rel, err)
		}
	})
}

func TestInstallable(t *testing.T) {
	t.Setenv("APPIMAGE", "")
	dir := t.TempDir()
	if err := Installable(filepath.Join(dir, "harper-pad")); err != nil {
		t.Errorf("writable directory rejected: %v", err)
	}
	if left, _ := filepath.Glob(filepath.Join(dir, ".update-probe-*")); len(left) != 0 {
		t.Errorf("probe file left behind: %v", left)
	}
	err := Installable(filepath.Join(dir, "missing", "harper-pad"))
	if err == nil || !strings.Contains(err.Error(), "package manager") {
		t.Errorf("unwritable location should explain itself: %v", err)
	}

	// Inside an AppImage the updater replaces the .AppImage file, so its directory is what counts.
	other := t.TempDir()
	t.Setenv("APPIMAGE", filepath.Join(other, "Trivy.AppImage"))
	if err := Installable("/usr/bin/harper-pad"); err != nil {
		t.Errorf("AppImage in a writable directory rejected: %v", err)
	}

	if os.Geteuid() != 0 { // root ignores directory permissions
		t.Setenv("APPIMAGE", "")
		ro := t.TempDir()
		if err := os.Chmod(ro, 0o555); err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() { _ = os.Chmod(ro, 0o755) })
		if err := Installable(filepath.Join(ro, "harper-pad")); err == nil {
			t.Error("read-only directory accepted")
		}
	}
}
