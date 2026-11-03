# CI design notes

Where the GitHub Actions workflows in `.github/workflows` come from, and what was deliberately left out.

Sources:
- Wails, [Crossplatform build with GitHub Actions](https://wails.io/docs/guides/crossplatform-build/) (a Wails **v2** guide).
- [`dAppServer/wails-build-action`](https://github.com/dAppServer/wails-build-action/blob/main/action.yml), the action that guide points to (also v2: it drives the `wails build` CLI).
- Wails v3's own `build-and-test-v3.yml`, for the test job. The two sources above contain **no test step at all**.

## What was taken from them

| Practice | Source | Where here |
|---|---|---|
| Build when a tag is pushed and keep the result as an Actions artifact | guide's example workflow | `release.yml` (semantic-version tags only, artifact `release-files`) |
| `setup-go` with `check-latest: true` and a cache keyed on `go.sum`; the Go version is read from `.tool-versions` | action's *Setup GoLang* step | every workflow that installs Go |
| Print `go version` so a run records its toolchain | action's `go version` step | CI, release, security (CI and release also print the GTK/WebKit versions) |
| Detect the distribution and **fail the run if it is unsupported** rather than build anyway | action's *Linux Discovery* step | `release.yml` *Check the build distribution*: the README promises a binary built on Ubuntu 24.04, which fixes the glibc and WebKitGTK baseline |
| Set the executable bit explicitly | action's *Add Linux perms* step | CI and release build steps |
| One named artifact per platform | action's `upload-artifact` step | CI uploads `harper-pad-linux-amd64` (unsigned, 7 days) so reviewers can try a PR build |
| Inject a version into the binary from the tag | guide's list of enhancements | `-X …/internal/app.version=…` in release (and `ci-<sha>` in CI) |
| Cache dependencies | guide's list of enhancements | `setup-go` cache |
| Create the release when a tag is pushed | action's release step | `release.yml` attaches the build to the draft that Release Drafter writes for the tag, then publishes it through the REST API (see [releasing](releasing.md#release-notes)) |
| Test job: GTK4 + WebKitGTK 6 build dependencies, `GOTOOLCHAIN: local`, cancel superseded PR runs | Wails v3 `build-and-test-v3.yml` | `ci.yml` |
| Job graph: `lint`, `test`, `build` and `windows` run in parallel, so wall time is the slowest job. `test` relies on `go test`'s built-in vet; the full `make vet` runs in `build`, after the compile it reuses. `lint` installs frontend dependencies but does not build the bundle. There is no `wails3 doctor` step (a missing GUI library fails the build) | this repo | `ci.yml` |

## What was left out, and why

- **Per-distro WebKit package and build tag** (the action picks `libwebkit2gtk-4.0` or `4.1` plus `-tags webkit2_41` by Ubuntu release). That is a Wails v2 / GTK3 concern. This app targets Wails v3's default GTK4 + WebKitGTK 6 backend only. A GTK3 build would be a separate asset and has not been asked for.
- **arm64 cross-compilation** (`gcc-aarch64-linux-gnu`), **macOS**, **a build matrix** and **Linux code signing and notarisation**: only Linux amd64 and Windows amd64 are published, each by its own job (Windows: see [windows](windows.md)). Provenance is covered by a build attestation and SHA-256 checksums instead.
- **The `wails build` CLI, obfuscation, Deno/Node build steps, `NODE_OPTIONS`**: the app is built with `go build`. The frontend is built first with `make frontend` (`npm ci && npm run build`, Vite), with the Node version from `.tool-versions` (`actions/setup-node`); the Go side only embeds `frontend/dist`. In `ci.yml`'s `lint` job a separate step regenerates `frontend/bindings` with the `wails3` CLI at the go.mod version and fails on any diff.

## Lint and format checks

`ci.yml` has no paths filter, so `lint` and `test` always run and can be required checks. Its `changes` job runs `dorny/paths-filter` on a pull request, and `build` and `windows` (the slow ones) are skipped, which a required check treats as passing, unless a file that goes into a binary changed (Go, `go.mod`/`go.sum`, `.tool-versions`, `frontend/`, `build/`, `Makefile`, packaging scripts, `ci.yml`, local actions). Pushes to `main` and manual runs always build.

`ci.yml` also runs, in the `lint` job: `make lint-frontend` (`biome check`: lint, format check and import order, config in `frontend/biome.json`), `make lint-editorconfig` (editorconfig-checker over every tracked file: tabs or spaces, trailing whitespace, final newline, line endings, from `.editorconfig`; the indent size is not checked because comment and Markdown continuation lines are off the grid; config in `.editorconfig-checker.json`, version `EDITORCONFIG_CHECKER_VERSION` in the `Makefile`) and `make lint-go` (golangci-lint with the config in `.github/linters/golangci.yml`: default linters; staticcheck's tagged-switch quick fixes and unchecked `Close`/test-helper writes are excluded). In CI, golangci-lint runs through its own `golangci/golangci-lint-action` (SHA-pinned like the others; a prebuilt binary plus the action's analysis cache) with `args` that mirror `make lint-go`; locally `make lint-go` runs through `go run <module>@<version>`. The golangci-lint version is written twice, as `GOLANGCI_LINT_VERSION` in the `Makefile` and as the action's `version:` (Renovate reads that one itself, and the `Makefile` comment gives the pin the same depName and datasource), so Renovate bumps them in one PR, and its "golangci-lint" group puts the action's own SHA in that PR too. The Go and Node versions in `.tool-versions` are not decisions to hold back: they should follow the latest stable release, so Renovate's PRs for them ("go toolchain", "node") are merged as soon as CI is green. The wails3 CLI (about 40 s to compile, needed by `lint` and `build`) is cached as a built binary with `actions/cache`, keyed on the Wails version in `go.mod` and the Go version; the release job still builds it from source, so a cached executable cannot reach a signed release. `make tools` installs `golangci-lint` and `goimports` into `GOBIN` for editors. `make lint` runs both locally; `make fmt` and `make format-frontend` fix formatting. The `lint` job also runs yamllint (`yamllint --strict -c .github/linters/yamllint.yml` over `git ls-files '*.yml' '*.yaml'`, inline in the workflow, not a Makefile target) (config in `.github/linters/yamllint.yml`, installed from PyPI at a Renovate-bumped version) on every tracked YAML file.

## Dependency updates (Renovate)

Self-hosted Renovate (`renovate.yml`, the `renovatebot/github-action`) replaces Dependabot, with the config in `.github/renovate.json5`.

- **What it updates:** Go modules, the frontend npm packages, Docker base images (every `FROM` line in `.devcontainer/Dockerfile`), the SHA-pinned Actions (`helpers:pinGitHubActionDigests` keeps the `# vX.Y.Z` comment), the Go and Node versions in `.tool-versions` (Renovate's asdf manager; `go.mod`'s `go` line and the golang and node images of the Dockerfiles repeat them, so each family is one Renovate group: "go toolchain", "node", and "wails" for the Wails Go module with `@wailsio/runtime`, which must be the same version), and anything marked with a `# renovate: datasource=<ds> depName=<name>` comment on the line above its version: the Go dev tools in the `Makefile`, zizmor and the `gh-pin-actions` extension in `actions-lint.yml`. apt packages in the dev container are left to the distribution.
- **When:** weekdays (cron) and on demand, on the default branch only, so a schedule only starts once the workflow is on `main`. It also keeps the "Dependency Dashboard" issue up to date.
- **Cooldown and automerge:** a release must be 2 days old before Renovate creates a branch for it (`minimumReleaseAge` with `internalChecksFilter: strict`). Patch and digest updates then automerge; minor and major updates wait for review. Minors are grouped per ecosystem (`actions`, `go-minor`, `frontend-minor`, `dev tools`) but patches never join a group, because a group merges as a whole. The Go version (workflows, `go.mod`, Dockerfiles) is one `go toolchain` PR that is never automerged. `@wailsio/runtime` and the runner image (`ubuntu-24.04`) are not updated.
- **Security:** advisories come from OSV.dev (`osvVulnerabilityAlerts`) and, in the real run, GitHub's own alerts (through the App's Dependabot alerts permission).
- **Config lint:** the `renovate config` job in `actions-lint.yml` runs `renovate-config-validator --strict` on `renovate.json5` (version pinned with a `# renovate:` comment).
- **Dry run:** a pull request that changes `renovate.json5` or `renovate.yml` runs Renovate with `RENOVATE_DRY_RUN=full` on its own branch. It writes nothing; the job summary lists the branches and updates it would create and the step log has the full debug output.
- **GitHub App:** the real run authenticates as a GitHub App ([renovatebot/github-action, "Example with GitHub App"](https://github.com/renovatebot/github-action#example-with-github-app)) through `actions/create-github-app-token`, not with `GITHUB_TOKEN`: PRs opened with `GITHUB_TOKEN` do not start CI, so an automerge would have no checks to wait for, and the workflow's own token stays read-only. Setup: create a GitHub App with repository permissions Contents, Pull requests, Issues, Workflows and Commit statuses (read and write; Renovate posts a `renovate/stability-days` status for `minimumReleaseAge`) and Checks and Dependabot alerts (read), install it on this repository, download its private key, then add the repository variable `RENOVATE_APP_CLIENT_ID` and the secret `RENOVATE_APP_PRIVATE_KEY`. Commits go through the API as the App (`platformCommit`), so they are verified. Require the CI checks in branch protection before relying on automerge. The dry run on pull requests mints a read-only token from the same App, so it also checks the App's credentials and installation (for pull requests from branches of this repository; forks get no secrets).

## Keeping pull requests up to date

`update-branches.yml` runs on every push to `main` (and by hand). A personal account has no merge queue, so it does what the "Update branch" button does for every open, non-draft, same-repository PR by the repository owner (`--author`, the personal account) that is behind `main`: it calls the `update-branch` API (merge, with `expected_head_sha` so a branch that moved meanwhile is left alone). The merge commit starts CI again, so the PR stays mergeable under "Require branches to be up to date before merging" (add that to the branch rules, together with auto-merge on the PR, for the full effect). It uses the Renovate GitHub App's token (Contents and Pull requests write), because a push with `GITHUB_TOKEN` starts no workflows.

- **Skipped on purpose:** PRs by anyone else, `renovate/*` (Renovate rebases its own branches, and a commit it did not make makes it stop updating the branch), fork PRs and drafts.
- **Conflicts:** the update fails for a PR whose branch conflicts with `main`; the job summary lists it and the author resolves it by hand.
- **Cost:** every push to `main` re-runs CI on each behind PR.

## PR titles and release notes

Release notes and the next version come from [`release-drafter`](https://github.com/release-drafter/release-drafter) and one config, `.github/release-drafter.yml`. Three workflows use it:

- `pr-title.yml` checks that a PR title follows `type(scope)!: summary` with [`amannn/action-semantic-pull-request`](https://github.com/amannn/action-semantic-pull-request), and labels the PR with Release Drafter's autolabeler (the `autolabeler` rules of that config; the notes and version read the title, so the label is a convenience and an override). It runs on every push to the PR, because a required check belongs to the head commit and `update-branches.yml` pushes merge commits. It runs for fork PRs as a read-only title check (labelling needs write access) and skips `bot/*` branches.
- `release-drafter.yml` keeps a draft release current on every push to `main` (a preview; it publishes nothing).
- `release.yml` has Release Drafter write the notes for the exact tag, uploads the build to that draft and publishes it. `tag-release.yml` uses it to pick the version when no tag is given.

All actions are SHA-pinned like the rest and use the workflow's own token. Details and the type table: [releasing](releasing.md#release-notes).

## Actions lint

`actions-lint.yml` runs on changes under `.github/`, on `main` and weekly: zizmor (pedantic persona, installed from PyPI at the version pinned in the workflow) audits workflows and composite actions, and `gh pin-actions workflows --latest` re-pins every `uses:` in the workflows a PR adds or changes (that job runs on pull requests only: on `main` an action can have a release Renovate has not bumped yet). The check fails on an unpinned action or one with a newer release. The tool pins immutable releases to the tag instead of the SHA; that is the same version, so it is not a failure.

## Pull request reports

Three workflows report on pull requests, copied from trivy-dashboard-wail3 and adapted. Each has a paths filter, so none of them is a required check, and each posts one sticky comment (marocchino/sticky-pull-request-comment, one `header` per workflow) that is updated on every push. Fork PRs have a read-only token, so they get the run's job summary or artifacts only.

- `dependency-scan.yml`: when `go.mod`, `go.sum` or the npm manifest or lockfile changes, Trivy scans the PR and its base and the comment lists the HIGH and CRITICAL vulnerabilities the PR adds and removes (`.github/trivy/dependency-scan.tpl`). The scan job has a read-only token; a separate job writes the comment. The blocking scan stays `trivy (filesystem)` in `security.yml`. Unlike the source repo there is no container image to scan.
- `screenshots.yml`: `scripts/screenshots.sh` builds the headless server, drives it with Playwright in Chrome and renders `docs/screenshots/*.png` (`make screenshots`). Each image is uploaded as its own unzipped artifact and embedded in the comment. The last three shots (08 to 10) are the phone layout (390 px wide, touch). Add a shot to `scripts/screenshots.mjs` and a matching `Upload` step to the workflow; the comment step fails when the two disagree. The headless build runs in demo mode (`HARPER_PAD_DEMO=1`, development builds only): a banner shows and the status bar's timings are fixed, so the images are the same on every run (the demo runs the real code: a SQLite database under `XDG_DATA_HOME`, and "Save as file" writes into `$HOME/Documents` via `HARPER_PAD_DEMO_SAVE_DIR` because a headless build has no save dialog; `scripts/lib/fake-app.sh` sets both, so Lighthouse loads the same app); the `build` job in `ci.yml` checks that the release binary has no demo mode. Screenshots are gitignored, and the `no-screenshots` job in `ci.yml` fails a PR that adds any. On pushes to `main` it also force-pushes the images to `bot/update-screenshots` (with the Renovate App token, so CI runs on it) and keeps one draft "Screenshots preview (do not merge)" PR open so the current images can be browsed in *Files changed*; `no-screenshots` fails on it, so it can't be merged.
- `lighthouse.yml`: `scripts/lighthouse.sh` audits the headless build (mobile and desktop, median of 3 runs) and fails below the minimum scores in `scripts/lighthouse.mjs`. The HTML and JSON reports are artifacts.

## Trivy DB cache

`trivy-cache.yml` refreshes the Trivy vulnerability DB cache daily on the default branch (the trivy-action README's recommendation). `security.yml` restores it through trivy-action's built-in cache and sets `TRIVY_SKIP_DB_UPDATE=true`, so they do not download the DB and avoid registry rate limits. If the cache is missing (never run, or evicted), the scans fail until the workflow runs once: trigger it with *Run workflow*.
