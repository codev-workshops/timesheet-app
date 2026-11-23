#!/usr/bin/env bash
# Shared helpers for timesheet-app Devin hooks. Hooks get the event JSON on stdin;
# exit 2 (or {"decision":"block"}) blocks, other non-zero exits are only logged.

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$HOOKS_DIR/../.." && pwd)"
CACHE_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/timesheet-app-hooks"
mkdir -p "$CACHE_DIR"

HOOK_INPUT="$(cat)"

field() { printf '%s' "$HOOK_INPUT" | jq -r "$1 // empty" 2>/dev/null; }

# The same hooks can load twice (repo .devin/hooks.v1.json and the org plugin);
# run once per identical payload within a few seconds.
dedupe_or_exit() {
  local key marker now
  key="$(printf '%s' "$HOOK_INPUT" | sha256sum | cut -c1-32)"
  marker="$CACHE_DIR/dedupe-$key"
  now="$(date +%s)"
  if [ -f "$marker" ] && [ $((now - $(cat "$marker"))) -lt 5 ]; then
    exit 0
  fi
  printf '%s' "$now" > "$marker"
  find "$CACHE_DIR" -name 'dedupe-*' -mmin +10 -delete 2>/dev/null
}

block() {
  jq -n --arg r "$1" '{decision: "block", reason: $r}'
  exit 2
}

add_context() {
  [ -z "$2" ] && return 0
  jq -n --arg e "$1" --arg c "$2" '{hookSpecificOutput: {hookEventName: $e, additionalContext: $c}}'
}

# Repo-relative path if the file is inside this repo, else empty.
repo_rel() {
  local p="$1"
  [ -z "$p" ] && return 0
  case "$p" in /*) ;; *) p="$REPO_ROOT/$p" ;; esac
  case "$p" in "$REPO_ROOT"/*) printf '%s' "${p#"$REPO_ROOT"/}" ;; esac
}
