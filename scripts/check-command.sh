#!/usr/bin/env bash
# PreToolUse hook: blocks destructive shell commands.
# Receives the event as JSON on stdin; exit code 2 blocks the action (other non-zero exits only log an error).

input=$(cat)
command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')

blocked='rm -rf|drop table|truncate table|git push --force|git reset --hard'

if printf '%s' "$command" | grep -qiE "$blocked"; then
  echo "Blocked by policy hook: destructive command detected." >&2
  exit 2
fi

exit 0
