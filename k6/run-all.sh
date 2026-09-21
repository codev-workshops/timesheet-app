#!/usr/bin/env bash
# Usage: k6/run-all.sh <label>   (label = baseline | after)
# Writes perf-reports/<label>/<script>.json + .txt and perf-reports/<label>.json (merged summary).
set -euo pipefail
LABEL="${1:?label required (baseline|after)}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/perf-reports/$LABEL"
mkdir -p "$OUT"
for script in work-entries-list client-report csv-export dashboard-load; do
  echo "=== k6 $script ($LABEL) ==="
  # k6 exits 99 when thresholds are crossed; keep going so all scripts are captured.
  k6 run --summary-export="$OUT/$script.json" "$ROOT/k6/$script.js" | tee "$OUT/$script.txt" || echo "(thresholds crossed for $script)"
done
node "$ROOT/k6/merge-summaries.js" "$OUT" "$ROOT/perf-reports/$LABEL.json"
