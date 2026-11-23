#!/usr/bin/env bash
# SessionStart: create missing .env files and inject repo gotchas (new sessions only).
source "$(dirname "$0")/lib.sh"
[ "$(field '.source')" = "resume" ] && exit 0
cd "$REPO_ROOT" || exit 0

for d in backend frontend; do
  [ -f "$d/.env" ] || { [ -f "$d/.env.example" ] && cp "$d/.env.example" "$d/.env"; }
done

add_context SessionStart "timesheet-app facts:
- Dev servers: backend 'cd backend && npm run dev' (port 3001), frontend 'cd frontend && npm run dev' (port 5173, proxies /api).
- The dev DB is in-memory SQLite: data resets on every backend restart, and PRAGMA foreign_keys is off, so ON DELETE CASCADE does not fire in dev.
- Joi date() makes work_entries.date a JS Date that sqlite stores as epoch ms; don't assert ISO dates in API tests.
- docker/Dockerfile overwrites backend/src/server.js and backend/src/database/init.js with docker/overrides/; patch both."
exit 0
