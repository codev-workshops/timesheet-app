#!/usr/bin/env bash
# Post a deploy notification to Slack. Skips (exit 0) when not configured.
set -euo pipefail

if [ -z "${SLACK_BOT_TOKEN:-}" ]; then
  echo "SLACK_BOT_TOKEN not set; skipping Slack notification."
  exit 0
fi

CHANNEL="${SLACK_CHANNEL:-#deployments}"
SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
REPO="${GITHUB_REPOSITORY:-timesheet-app}"
TEXT="Deployed ${REPO} @ ${SHA:0:7} to production."

curl -sSf -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer ${SLACK_BOT_TOKEN}" \
  -H "Content-Type: application/json; charset=utf-8" \
  --data "$(printf '{"channel":"%s","text":"%s"}' "$CHANNEL" "$TEXT")" \
  | grep -q '"ok":true' || { echo "Slack API call failed" >&2; exit 1; }

echo "Slack notification sent to ${CHANNEL}."
