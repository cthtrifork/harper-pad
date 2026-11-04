# Releasing

## Cut a release

**Actions → Tag and release → Run workflow** (on `main`), or from a terminal:

```sh
gh workflow run tag-release.yml                    # next version, from the merged PR titles
gh workflow run tag-release.yml -f tag=v1.0.0      # an exact tag
```

| Input | Effect |
|---|---|
| `tag` (text, optional) | Use exactly this tag: `v1.4.0` or `v1.4.0-rc.1`. Left empty, the workflow uses the version Release Drafter works out from the PRs merged since the last release: a breaking change (`!`) is a major, a `feat` a minor, anything else a patch ([Release notes](#release-notes)). |

To force a different version than Release Drafter proposes, pass it as `tag`. The tag must be a semantic version with a leading `v`.

The workflow then:

1. refuses to run anywhere but `main`;
2. works out the version (the `tag` input, otherwise Release Drafter's) and stops if a git tag of that name already exists (see *Retrying* for an existing tag);
3. calls `release.yml` with that version and the commit it started on (the head of `main`). That commit is built, and **no tag exists yet**: `release.yml` re-runs vet, tests and `govulncheck` (in a `checks` job beside the binary build, not before it), builds the Linux binary and, on a Windows runner, the Windows exe (see [windows](windows.md)), pushes the two backend images (`harper-pad-sync`, `harper-pad-admin`) to ghcr.io, and publishes the
   release: the draft Release Drafter wrote for that version, with the assets attached (Linux binary, tarball, signed `.deb` and `.rpm`, public key, Windows exe, CycloneDX SBOM, `SHA256SUMS`) and signed attestations. Publishing sets the release's target to the built commit and GitHub creates the tag there. See [self-update](self-update.md) for why those assets
   have the names they do.

## Release notes

[Release Drafter](https://github.com/release-drafter/release-drafter) writes the notes and works out the next version, from one config, [`.github/release-drafter.yml`](../.github/release-drafter.yml). Nobody tags PRs or edits notes by hand: a PR title is all it needs.

**Title: `type(scope)!: summary`** ([Conventional Commits](https://www.conventionalcommits.org/)). The `scope` and `!` are optional. Write the effect a user sees (`fix: keep the last scan on disk across a restart`), not the diff (`fix: change persist.go`). Squash merges use the title as the commit subject, so the history reads the same way. In the notes the `type(scope):` prefix is dropped and the first letter capitalised, because the section already says what kind of change it is.

| Type | Release-note section | Label | Next version |
|---|---|---|---|
| any type with `!` | Breaking changes (first) | `breaking-change` | major |
| `security` | Security | `security` | patch |
| `feat` | New features | `feature` | minor |
| `fix` | Bug fixes | `bug` | patch |
| `perf` | Performance | `performance` | patch |
| `docs` | Documentation | `documentation` | patch |
| `deps` | Dependencies (collapsed after 5) | `dependencies` | patch |
| `ci`, `build` | CI, build and release | `ci`, `build` | patch |
| `refactor`, `test`, `chore`, `revert` | Maintenance | `maintenance` (`refactor` also `refactor`) | patch |
| anything else | Other changes | none | patch |

A PR is listed once, in the first section it matches (title type, or the label as an override). The next version is the highest increment among the merged PRs. A PR labelled `skip-changelog` is left out of both the notes and the version.

**How it fits the release flow**

1. *Release Drafter* (`release-drafter.yml`) runs on every push to `main` and keeps a **draft release** current: a preview of the next notes and version. Nothing is published from it. Open the repository's Releases page to read it before cutting a release.
2. *Tag and release* with no `tag` tags the version Release Drafter resolved. An explicit `tag` wins; then Release Drafter is only asked for the notes.
3. `release.yml` asks Release Drafter for the notes of exactly that tag (`tag`, and `commitish` = the tag, so the list ends at the tagged commit), then `gh release upload` puts the build on that draft and `gh release edit --draft=false --verify-tag` publishes it with the notes set again from the same run. `gh` finds the draft by its pending tag name, so if a push to `main` makes `release-drafter.yml` retarget the draft to another version meanwhile, the run fails and publishes nothing; run it again. A retry replaces the assets a failed attempt left on the draft (`--clobber`; their names carry the version).

**Enforcement.** The *PR title* workflow (`pr-title.yml`) fails a PR whose title does not match (`amannn/action-semantic-pull-request`) and sets the label from the type (Release Drafter's autolabeler, `autolabeler` in the same config; with `sync-labels` it also removes a stale label when the title is edited and creates a label that does not exist yet). The labels are for filtering and as a manual override: the notes and the version read the title, so a missing label does not misfile a PR. Fork PRs are checked but not labelled (the token is read-only). Renovate PRs are titled `deps: update ...`, or `security: ...` for vulnerability fixes (`semanticCommits` in `renovate.json5`), so they get the same sections and labels. To make the check block merging, add **check title** as a required status check in the branch rules (repository settings; not something a workflow can do).

When you change a type or section, change the `types` in `pr-title.yml`, the categories and autolabeler rules in `.github/release-drafter.yml`, and the table above together.

**Limits.** Release Drafter finds the last release from the published releases, not the tags, so a tag that was never released does not move the base version. A non-conventional title (a PR opened before this convention, or by someone who ignored the check) lands in *Other changes* as a patch.

## One-time setup: the package signing key

The `.deb` and `.rpm` are signed with a PGP key kept in two repository secrets (Settings → Secrets and variables →
Actions). A release **fails without the key**; a dry run on a branch builds unsigned packages.

```sh
gpg --quick-gen-key 'Harper Pad releases <you@example.com>' rsa4096 sign 2y
gpg --armor --export-secret-keys <fingerprint>        # -> secret RELEASE_GPG_PRIVATE_KEY
# the key's passphrase                                 # -> secret RELEASE_GPG_PASSPHRASE (omit for no passphrase)
```

Use a key made only for this. The workflow exports the matching public key as `harper-pad-release-key.asc` on every
release and prints its fingerprint in the log, so publish the fingerprint somewhere users can cross-check it (the README
is a good place). Rotating the key means updating the secrets; users import the new public key.

## Packages

`scripts/package-linux.sh` runs `wails3 tool package` (nfpm) with `build/linux/nfpm/nfpm.yaml`. They install the
binary to `/usr/bin/harper-pad`, the launcher `build/linux/io.github.cthtrifork.harper-pad.desktop` (category Office, startup
notification, `StartupWMClass=io.github.cthtrifork.harper-pad`, matching `ApplicationID` in `main.go`) and the icon in hicolor (256px PNG
and scalable SVG). Dependencies are `libgtk-4-1` and `libwebkitgtk-6.0-4` (`gtk4`, `webkitgtk6.0` for the rpm).
The packages are built from the Ubuntu 24.04 binary, so the Fedora package needs a Fedora with
WebKitGTK 6 and a glibc that new. Try it locally with a built binary: `make wails3-install` then
`scripts/package-linux.sh <binary> v1.2.3 dist` (set `PKG_SIGNING_KEY_FILE` and `NFPM_PASSPHRASE` to sign).

## Windows file

`build windows/amd64` in `release.yml` runs `scripts/package-windows.sh` on a `windows-2022` runner: a cgo-free build
(`GOOS=windows`, `-H windowsgui`, version resources and icon from `build/windows`). For a real release it then signs the
exe through SignPath when the repository is set up for it, and checks the signature. It starts the exe and checks it is
still running after 20 seconds, so a release whose exe dies on start is not published. CI's `windows` job runs vet, the
tests and the exe build on every pull request. See [windows](windows.md) for the SignPath setup and what is not covered.

## Retrying

The tag is only created when the release is published, at the very end, so a release that failed (a flaky step, a
vulnerability that needed fixing first) left **no tag** behind. Fix what broke, then run **Tag and release** again with
the **exact version** in `tag` (leaving it empty takes whatever Release Drafter proposes now, which may have moved on). It
builds the head of `main` as it is then, so a fix merged in between is in the release. The draft and any assets an earlier
attempt left on it are reused and replaced.

If the tag already exists, *Tag and release* refuses it: that is a tag pushed from a machine, or a release that was
published. To finish a release for an existing tag, run **Release** (`release.yml`) from that tag's ref (Run workflow, "Use
workflow from" the tag).

## Immutable releases

The repository can turn on *immutable releases* (Settings, General; it only applies to releases published afterwards). The release flow is written for it: `release.yml` creates the release as a draft (Release Drafter), attaches every asset to the draft and only then publishes it, which is the order GitHub requires for the assets to be locked in. After publishing, the tag and the assets can no longer be changed or deleted; the title, notes, pre-release flag and *latest* flag still can (the publish step sets them in the same call). That has consequences:

- **A published release cannot be fixed in place.** Cut a new version with the fix. Do not try to move the tag or replace an asset.
- **A tag name is used up for good.** Even after the release is deleted the tag name cannot be reused. A failed run leaves no tag, only a draft, which is fine to retry or delete (see *Retrying*).
- The release also gets GitHub's own release attestation, next to the build-provenance and SBOM attestations this workflow signs (below).
- **Checked.** Immutable releases are on in the repository settings, and v0.6.0 was published this way (uploading to the draft and publishing it with the tag created at that moment both work; `gh release view v0.6.0 --json isImmutable` says `true`).

## Why the release is called, not triggered

Pushing a tag from your own machine still triggers `release.yml`. *Tag and release* does not push one: it calls
`release.yml` directly with the commit to release, and the tag appears when the release is published. (A tag created by a
workflow using its own `GITHUB_TOKEN` would not trigger other workflows anyway: GitHub prevents workflows from starting
each other that way. The alternative is a personal access token or a GitHub App, which adds a long-lived secret.)

## Notes

- Only one *Tag and release* run happens at a time, so two runs cannot pick the same next version.
- The release is built from the commit *Tag and release* started on (a tag ref when `release.yml` is dispatched on one), not
  from whatever `main` has become by then, and `release.yml` still checks that commit is on `main`.
- Running `release.yml` by hand on a branch is still a dry run that builds but does not publish. Dispatched on a tag it
  publishes, which is another way to retry.

## Verifying a release

The release job signs a SLSA build-provenance attestation for the binaries, tarball, packages and SBOM, and an SBOM attestation for
the binary, then verifies them itself before creating the release. To check a download by hand:

```sh
gh attestation verify harper-pad_linux_amd64 --repo cthtrifork/harper-pad
gh attestation verify harper-pad_linux_amd64 --repo cthtrifork/harper-pad \
  --predicate-type https://cyclonedx.org/bom
```

With immutable releases on, GitHub's own attestation covers the tag, commit and assets, and the CLI checks it:

```sh
gh release verify v1.2.3 --repo cthtrifork/harper-pad
gh release verify-asset v1.2.3 harper-pad_linux_amd64 --repo cthtrifork/harper-pad
```

The packages are also signed with the release PGP key. Import `harper-pad-release-key.asc` from the release, check
its fingerprint, then:

```sh
# rpm: rpmkeys --import checks the signature from now on, even with plain rpm/dnf
sudo rpmkeys --import harper-pad-release-key.asc
rpm --checksig harper-pad_<version>_x86_64.rpm

# deb: the signature is an origin signature inside the .deb (_gpgorigin), checked with debsig-verify
# or by hand; apt itself does not check it for a file installed with `apt install ./x.deb`.
ar p harper-pad_<version>_amd64.deb debian-binary control.tar.gz data.tar.gz > payload
ar p harper-pad_<version>_amd64.deb _gpgorigin > payload.sig
gpg --import harper-pad-release-key.asc && gpg --verify payload.sig payload
```

The SBOM (`harper-pad_<version>.sbom.cdx.json`) lists the Go modules and npm packages the binary is built from (from `go.mod` and `frontend/package-lock.json`), generated with Trivy (`format: cyclonedx`).
It has no os/arch in its name so the in-app updater never considers it as the binary.
