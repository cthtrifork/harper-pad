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

// Enabled reports whether a build that identifies itself as version should be
// able to update. This matters: the updater compares versions with x/mod/semver,
// where an invalid string such as "dev" sorts below every real version, so a
// development build would otherwise offer to replace itself with the newest
// release.
//
// Release builds are always stamped with the git tag, which the release workflow
// requires to be vMAJOR.MINOR.PATCH[-prerelease], so a leading "v" plus valid semver
// is the whole test: "dev", "ci-<sha>" and the like are not release versions.
func Enabled(version string) bool { return semver.IsValid(version) }

// isArchive reports whether an asset name is an archive or a Linux package (.deb, .rpm), none of
// which the updater can install in place.
func isArchive(name string) bool {
	n := strings.ToLower(name)
	for _, ext := range []string{".tar.gz", ".tgz", ".zip", ".deb", ".rpm"} {
		if strings.HasSuffix(n, ext) {
			return true
		}
	}
	return false
}

// MatchAsset picks the raw binary for the running platform. Archives and packages are
// skipped on purpose: the release also ships a tarball (binary + README + LICENSE) and
// .deb/.rpm packages for people, but the updater can only install a single file or an archive with
// exactly one top-level entry, and the default matcher would take whichever
// matching asset GitHub lists first.
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

// failClosed wraps a provider and refuses releases without a digest. The GitHub
// provider silently omits verification when the checksum file is missing or has
// no line for the chosen asset, and the updater would then install unchecked
// bytes. For a program that replaces its own executable that must be an error.
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

// Installable reports whether the updater could replace the executable at exe. It stages
// the new binary in a directory beside it, so that directory must be writable. A copy
// installed by a package manager (/usr/bin) is not, and should be updated by that package
// manager instead. Inside an AppImage the updater replaces the .AppImage file itself.
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
