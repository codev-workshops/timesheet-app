#!/usr/bin/env bash
# Runs gitleaks: uses a gitleaks on PATH if present, otherwise the pinned binary from scripts/install-gitleaks.sh.
set -euo pipefail

if command -v gitleaks >/dev/null 2>&1; then
  bin="$(command -v gitleaks)"
else
  bin="$(bash "$(dirname "${BASH_SOURCE[0]}")/install-gitleaks.sh")"
fi

exec "$bin" "$@"
