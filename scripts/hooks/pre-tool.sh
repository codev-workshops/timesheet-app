#!/usr/bin/env bash
# PreToolUse: block destructive shell commands and edits to protected files.
source "$(dirname "$0")/lib.sh"
dedupe_or_exit

tool="$(field '.tool_name')"
command="$(field '.tool_input.command')"
if [ -n "$command" ]; then
  # Build output and dependency folders are safe to wipe.
  scan="$command" prev=""
  while [ "$scan" != "$prev" ]; do
    prev="$scan"
    scan="$(printf '%s' "$scan" | sed -E 's#(^|[[:space:]])(\./)?((frontend|backend)/)?(node_modules|dist|build|coverage|\.vite)/?([[:space:]]|$|;|&)#\1\6#g')"
  done
  rm_rf='rm[[:space:]]+(-[a-zA-Z]*[rR][a-zA-Z]*[fF]|-[a-zA-Z]*[fF][a-zA-Z]*[rR]|--recursive[[:space:]]+--force|--force[[:space:]]+--recursive)[[:space:]]+[^-;&|[:space:]]'
  if printf '%s' "$scan" | grep -qiE "$rm_rf"; then
    block "Blocked by timesheet-app policy hook: recursive force delete ($command). Only node_modules, dist, build, coverage and .vite may be removed this way; ask the user for anything else."
  fi
  patterns=(
    'git[[:space:]]+push([[:space:]].*)?[[:space:]](-f|--force)([[:space:]]|$)'
    'git[[:space:]]+reset[[:space:]]+--hard'
    'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
    'git[[:space:]]+checkout[[:space:]]+--[[:space:]]+\.'
    'drop[[:space:]]+(table|database)'
    'truncate[[:space:]]+table'
    'delete[[:space:]]+from[[:space:]]+[a-z_]+[[:space:]]*(;|$|"|'"'"')'
  )
  for p in "${patterns[@]}"; do
    if printf '%s' "$command" | grep -qiE "$p"; then
      block "Blocked by timesheet-app policy hook: destructive command detected ($command). Use a safer alternative or ask the user."
    fi
  done
fi

case "$tool" in *read*|*view*|*grep*|*glob*|write_to_process) exit 0 ;; esac

paths="$(field '[.tool_input.file_path, .tool_input.path, .tool_input.notebook_path] | map(select(. != null)) | join("\n")')"
patch="$(field '.tool_input.patch // .tool_input.input')"
if [ -n "$patch" ]; then
  paths="$paths
$(printf '%s' "$patch" | sed -nE 's/^\*\*\* (Add|Update|Delete) File: (.*)$/\2/p')"
fi

while IFS= read -r p; do
  rel="$(repo_rel "$p")"
  case "$rel" in
    */.env|.env)
      block "Blocked by timesheet-app policy hook: $rel holds local secrets. Edit the matching .env.example instead." ;;
  esac
done <<< "$paths"

exit 0
