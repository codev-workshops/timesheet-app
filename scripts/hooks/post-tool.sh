#!/usr/bin/env bash
# PostToolUse: after a file edit, feed back repo-convention warnings (never blocks).
source "$(dirname "$0")/lib.sh"
dedupe_or_exit

case "$(field '.tool_name')" in *read*|*view*|*grep*|*glob*|write_to_process|exec) exit 0 ;; esac

paths="$(field '[.tool_input.file_path, .tool_input.path, .tool_input.notebook_path] | map(select(. != null)) | join("\n")')"
patch="$(field '.tool_input.patch // .tool_input.input')"
if [ -n "$patch" ]; then
  paths="$paths
$(printf '%s' "$patch" | sed -nE 's/^\*\*\* (Add|Update) File: (.*)$/\2/p')"
fi
[ -z "$paths" ] && exit 0

cd "$REPO_ROOT" || exit 0
notes=""
note() { notes="${notes}- $1"$'\n'; }

while IFS= read -r p; do
  rel="$(repo_rel "$p")"
  [ -z "$rel" ] || [ ! -f "$rel" ] && continue

  # Only lines this session added (unstaged/staged vs HEAD, or the whole file if untracked).
  if git ls-files --error-unmatch "$rel" >/dev/null 2>&1; then
    added="$(git diff HEAD -U0 -- "$rel" | grep -E '^\+[^+]' | cut -c2-)"
  else
    added="$(cat "$rel")"
  fi

  case "$rel" in
    backend/src/__tests__/*) ;;
    backend/src/*.js|backend/src/**/*.js)
      sql_re='(SELECT|INSERT|UPDATE|DELETE)[[:space:]]'
      if printf '%s' "$added" | grep -E "$sql_re" | grep -qE '\$\{|["'"'"'`][[:space:]]*\+[[:space:]]*[a-zA-Z_]'; then
        note "$rel: new SQL builds the query with \${...} or string concatenation. Use ? placeholders for every value (sql-safety rule); only whitelisted column names may be interpolated."
      fi
      if printf '%s' "$added" | grep -qiE '(FROM|INTO|UPDATE|JOIN)[[:space:]]+(clients|work_entries)' \
         && ! printf '%s' "$added" | grep -q 'user_email'; then
        note "$rel: new query on clients/work_entries has no user_email condition. Every query must be scoped by user_email (user isolation)."
      fi
      ;;
  esac

  case "$rel" in
    backend/src/server.js|backend/src/database/init.js)
      note "$rel is overwritten in the Docker image by docker/overrides/${rel#backend/src/}. Apply the same change there or the image silently diverges." ;;
  esac

  case "$rel" in
    frontend/src/*.ts|frontend/src/*.tsx)
      lint="$(cd frontend && timeout 40 npx --no-install eslint --no-warn-ignored "${rel#frontend/}" 2>/dev/null | grep -vE '^\s*$' | head -20)"
      [ -n "$lint" ] && note "ESLint findings in $rel:"$'\n'"$lint"
      case "$rel" in
        frontend/src/api/*) ;;
        *)
          if printf '%s' "$added" | grep -qE '\bfetch\(|from[[:space:]]+["'"'"']axios["'"'"']'; then
            note "$rel: direct fetch/axios call. Server state must go through apiClient (frontend/src/api/) and TanStack Query hooks."
          fi ;;
      esac ;;
  esac
done <<< "$paths"

[ -n "$notes" ] && add_context PostToolUse "timesheet-app hook warnings:"$'\n'"$notes"
exit 0
