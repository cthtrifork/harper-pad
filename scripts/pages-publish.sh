#!/usr/bin/env bash
# Publishes to the gh-pages branch, which GitHub Pages serves. See docs/pages.md.
#
#   pages-publish.sh site <dir>         replace the site root with <dir> (the latest release); preview/, pr-<n>/, CNAME and .nojekyll stay
#   pages-publish.sh main <dir>         replace preview/ with <dir> (the head of main)
#   pages-publish.sh preview <n> <dir>  replace pr-<n>/ with <dir>
#   pages-publish.sh remove <n>         delete pr-<n>/ (nothing to do if it is not there)
#
# PAGES_REMOTE is the git URL to push to (default `origin`), PAGES_BRANCH the branch (default gh-pages). Each call only touches its
# own part of the branch, so racing deploys just retry on top of one another.
set -euo pipefail

usage="usage: pages-publish.sh site <dir> | main <dir> | preview <n> <dir> | remove <n>"
mode="${1:?$usage}"
remote="${PAGES_REMOTE:-origin}"
branch="${PAGES_BRANCH:-gh-pages}"

case "$mode" in
  site) src="${2:?$usage}"; msg="Deploy the site" ;;
  main) src="${2:?$usage}"; msg="Deploy main to preview/" ;;
  preview) pr="${2:?$usage}"; src="${3:?$usage}"; msg="Deploy the preview of pull request $pr" ;;
  remove) pr="${2:?$usage}"; msg="Remove the preview of pull request $pr" ;;
  *) echo "$usage" >&2; exit 2 ;;
esac
# The number ends up in a path that is deleted: digits only, so it can never be ".." or a glob.
if [ -n "${pr:-}" ]; then
  case "$pr" in '' | *[!0-9]*) echo "pages-publish: not a pull request number: $pr" >&2; exit 2 ;; esac
fi
if [ -n "${src:-}" ]; then
  [ -f "$src/index.html" ] || { echo "pages-publish: $src has no index.html (build the web version first)" >&2; exit 1; }
  src="$(realpath "$src")"
fi

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q .
git remote add origin "$remote"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git config commit.gpgsign false

for attempt in 1 2 3 4 5; do
  if git ls-remote --exit-code --heads origin "$branch" >/dev/null 2>&1; then
    git fetch -q --depth 1 origin "$branch"
    git checkout -q -B "$branch" FETCH_HEAD
  else
    git checkout -q --orphan "$branch"
    git rm -rq --ignore-unmatch . >/dev/null 2>&1 || true
  fi

  case "$mode" in
    site)
      # Everything except the previews (preview/ and pr-<n>/), the custom domain file and git's own folder.
      find . -mindepth 1 -maxdepth 1 ! -name .git ! -name CNAME ! -name .nojekyll ! -name preview ! -name 'pr-[0-9]*' -exec rm -rf {} +
      cp -a "$src"/. .
      ;;
    main)
      rm -rf preview
      mkdir preview
      cp -a "$src"/. preview/
      ;;
    preview)
      rm -rf "pr-$pr"
      mkdir "pr-$pr"
      cp -a "$src"/. "pr-$pr"/
      ;;
    remove)
      rm -rf "pr-$pr"
      ;;
  esac
  touch .nojekyll # the site is plain files; without this Pages runs them through Jekyll, which skips folders that start with "_"

  git add -A
  if git diff --cached --quiet; then
    echo "pages-publish: nothing to change"
    exit 0
  fi
  git commit -q -m "$msg"
  if git push -q origin "HEAD:$branch"; then
    echo "pages-publish: $msg"
    exit 0
  fi
  echo "pages-publish: push failed (attempt $attempt), retrying on top of the new branch" >&2
  sleep $((attempt * 2))
done
echo "pages-publish: giving up after 5 attempts" >&2
exit 1
