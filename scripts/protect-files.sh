#!/usr/bin/env bash
# PreToolUse hook: blocks any tool call that references a protected file,
# so its contents never reach the LLM. Protected paths live in
# .devin/protected-files.txt. Exit 2 denies the tool call.

input=$(cat)
root="$(cd "$(dirname "$0")/.." && pwd)"
list="$root/.devin/protected-files.txt"
[ -f "$list" ] || exit 0

# Every string anywhere in tool_input (file paths, shell commands, grep paths, MCP args...).
args=$(printf '%s' "$input" | jq -r '[.tool_input | .. | strings] | join("\n")' 2>/dev/null)
[ -n "$args" ] || exit 0

tool=$(printf '%s' "$input" | jq -r '.tool_name // "unknown"')

while IFS= read -r entry || [ -n "$entry" ]; do
  entry="${entry%%#*}"
  entry="$(printf '%s' "$entry" | xargs)"
  [ -n "$entry" ] || continue
  escaped=$(printf '%s' "$entry" | sed 's/[][\.*^$+?(){}|/]/\\&/g')
  # Match the path as a whole token, so frontend/.env does not match frontend/.env.example.
  if printf '%s' "$args" | grep -qE "(^|[^A-Za-z0-9_.-])${escaped}([^A-Za-z0-9_.-]|$)"; then
    reason="Blocked by policy hook: '$entry' is a protected file and its contents must not be sent to the LLM (tool: $tool)."
    jq -nc --arg r "$reason" '{decision: "block", reason: $r}'
    echo "$reason" >&2
    exit 2
  fi
done < "$list"

exit 0
