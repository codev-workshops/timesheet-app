#!/usr/bin/env bash
# Stop: don't finish with failing checks. Backend changes -> npm test;
# frontend changes -> lint + build. Gives up after 3 blocks per turn to avoid loops.
source "$(dirname "$0")/lib.sh"
dedupe_or_exit
cd "$REPO_ROOT" || exit 0

changed="$(git status --porcelain --untracked-files=all 2>/dev/null | cut -c4-)"
[ -z "$changed" ] && exit 0

state="$(git diff HEAD 2>/dev/null; git status --porcelain --untracked-files=all)"
hash="$(printf '%s' "$state" | sha256sum | cut -c1-32)"
[ -f "$CACHE_DIR/stop-pass-$hash" ] && exit 0

turn="$(field '.prompt_id')"; turn="${turn:-$(field '.session_id')}"
counter="$CACHE_DIR/stop-count-${turn:-none}"
count="$(cat "$counter" 2>/dev/null || echo 0)"
[ "$count" -ge 3 ] && exit 0

failures=""
run_check() {
  local label="$1" dir="$2"; shift 2
  local out
  if ! out="$(cd "$dir" && timeout 240 "$@" 2>&1)"; then
    failures="${failures}${label} failed:"$'\n'"$(printf '%s' "$out" | tail -25)"$'\n\n'
  fi
}

if printf '%s\n' "$changed" | grep -q '^backend/'; then
  run_check "Backend tests (cd backend && npm test)" backend npm test --silent
fi
if printf '%s\n' "$changed" | grep -q '^frontend/'; then
  run_check "Frontend lint (cd frontend && npm run lint)" frontend npm run lint --silent
  run_check "Frontend build (cd frontend && npm run build)" frontend npm run build --silent
fi

if [ -n "$failures" ]; then
  echo $((count + 1)) > "$counter"
  block "timesheet-app checks are failing on your uncommitted changes. Fix them before finishing:"$'\n\n'"$failures"
fi

touch "$CACHE_DIR/stop-pass-$hash"
exit 0
