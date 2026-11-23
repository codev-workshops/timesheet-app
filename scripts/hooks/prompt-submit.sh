#!/usr/bin/env bash
# UserPromptSubmit: inject a checklist when the request touches schema, data or deploys.
source "$(dirname "$0")/lib.sh"
dedupe_or_exit
prompt="$(field '.prompt')"

if printf '%s' "$prompt" | grep -qiE 'schema|table|column|database|migration|sqlite|docker|deploy'; then
  add_context UserPromptSubmit "timesheet-app checklist for schema/data/deploy work:
- Schema lives in backend/src/database/init.js AND docker/overrides/database/init.js; change both.
- New columns need Joi validation in backend/src/validation/schemas.js and tests in backend/src/__tests__/.
- Every query: ? placeholders and a user_email condition.
- Deploy pipeline: .github/workflows/deploy.yml builds docker/Dockerfile."
fi
exit 0
