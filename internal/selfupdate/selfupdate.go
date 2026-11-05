// Package selfupdate configures Wails' built-in updater: a GitHub Releases provider that only
// offers installable, checksum-verified releases and never updates development builds.
package selfupdate

import (
	"context"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v3/pkg/updater"
	"github.com/wailsapp/wails/v3/pkg/updater/providers/github"
	"golang.org/x/mod/semver"
)

const (
	// Repository is where releases are published.
	Repository = "cthtrifork/harper-pad"
	// ChecksumAsset is the release asset listing the SHA-256 of every other asset.
	// The provider looks it up by exact name, so it must not contain the version.
	ChecksumAsset = "SHA256SUMS"
)

// Enabled reports whether a build with this version may update. The updater sorts an invalid version such as "dev" below every
// release, so a development build would otherwise replace itself with the newest one.
func Enabled(version string) bool { return semver.IsValid(version) }

// isArchive reports whether an asset name is an archive, a Linux package (.deb, .rpm) or the Windows
// installer (..._installer.exe), none of which the updater can install in place. The raw Windows binary,
// harper-pad_windows_amd64.exe, is the one .exe it does install.
func isArchive(name string) bool {
	n := strings.ToLower(name)
	for _, ext := range []string{".tar.gz", ".tgz", ".zip", ".deb", ".rpm", "_installer.exe"} {
		if strings.HasSuffix(n, ext) {
			return true
		}
	}
	return false
}

// MatchAsset picks the raw binary for the running platform. Archives and packages are skipped on purpose: the updater can only
// install a single file, and the default matcher would take whichever matching asset GitHub lists first.
func MatchAsset(req updater.CheckRequest, assets []github.ReleaseAsset) int {
	var plain []github.ReleaseAsset
	var origin []int
	for i, a := range assets {
		if !isArchive(a.Name) {
			plain = append(plain, a)
			origin = append(origin, i)
		}
	}
	if i := github.DefaultAssetMatcher(req, plain); i >= 0 {
		return origin[i]
	}
	return -1
}

// ErrUnverified is returned for a release that carries no SHA-256 digest.
var ErrUnverified = errors.New("release has no SHA-256 digest to verify the download against")

// failClosed wraps a provider and refuses releases without a digest. The GitHub provider silently skips verification when the
// checksum is missing, which for a program that replaces its own executable must be an error.
type failClosed struct{ updater.Provider }

func (p failClosed) Check(ctx context.Context, req updater.CheckRequest) (*updater.Release, error) {
	rel, err := p.Provider.Check(ctx, req)
	if err != nil || rel == nil {
		return rel, err
	}
	if rel.Verification == nil || len(rel.Verification.Digest) == 0 {
		return nil, fmt.Errorf("%w (release %s, asset %s): is %s part of the release?",
			ErrUnverified, rel.Version, rel.Artifact.Filename, ChecksumAsset)
	}
	return rel, nil
}

// NewProvider returns the GitHub Releases provider. baseURL overrides the API
// endpoint (GitHub Enterprise, or a test server); empty means api.github.com.
func NewProvider(baseURL string) (updater.Provider, error) {
	gh, err := github.New(github.Config{
		Repository:    Repository,
		BaseURL:       baseURL,
		AssetMatcher:  MatchAsset,
		ChecksumAsset: ChecksumAsset,
	})
	if err != nil {
		return nil, err
	}
	return failClosed{gh}, nil
}

// Installable reports whether the updater could replace the executable at exe. It stages the new binary beside it, so that folder
// must be writable; a package-manager install (/usr/bin) is not, and is updated by the package manager instead.
func Installable(exe string) error {
	if appImage := os.Getenv("APPIMAGE"); appImage != "" {
		exe = appImage
	}
	dir := filepath.Dir(exe)
	probe, err := os.CreateTemp(dir, ".update-probe-*")
	if err != nil {
		return fmt.Errorf("%s is not writable, so the app cannot replace itself there "+
			"(was it installed by a package manager? update it with that instead): %w", dir, err)
	}
	probe.Close()
	return os.Remove(probe.Name())
}
