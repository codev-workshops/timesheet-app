#!/usr/bin/env bash
# Create and push a release tag for the deployed commit. Skips (exit 0) when not configured.
set -euo pipefail

if [ -z "${GITHUB_PAT:-}" ]; then
  echo "GITHUB_PAT not set; skipping release tagging."
  exit 0
fi

REPO="${GITHUB_REPOSITORY:?GITHUB_REPOSITORY is required}"
SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
TAG="${RELEASE_TAG:-release-$(date -u +%Y%m%d-%H%M%S)}"

git config user.name "github-actions[bot]"
git config user.email "github-actions[bot]@users.noreply.github.com"
git tag -a "$TAG" "$SHA" -m "Production release ${TAG}"
git push "https://x-access-token:${GITHUB_PAT}@github.com/${REPO}.git" "refs/tags/${TAG}"

echo "Tagged ${SHA:0:7} as ${TAG}."
