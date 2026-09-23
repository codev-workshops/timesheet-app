#!/usr/bin/env bash
# Trigger the billing reconciliation webhook after a deploy. Skips (exit 0) when not configured.
set -euo pipefail

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "STRIPE_SECRET_KEY not set; skipping billing reconciliation."
  exit 0
fi

if [ -z "${BILLING_WEBHOOK_URL:-}" ]; then
  echo "BILLING_WEBHOOK_URL not set; skipping billing reconciliation."
  exit 0
fi

SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"

curl -sSf -X POST "$BILLING_WEBHOOK_URL" \
  -H "Authorization: Bearer ${STRIPE_SECRET_KEY}" \
  -H "Content-Type: application/json" \
  --data "$(printf '{"event":"deploy","sha":"%s"}' "$SHA")"

echo "Billing reconciliation triggered for ${SHA:0:7}."
