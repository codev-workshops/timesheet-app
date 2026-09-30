#!/usr/bin/env bash
# Exploratory runtime test script for timesheet-app backend.
# Exercises the API and appends findings to runtime-test-report.md.
# Usage: ./runtime-test.sh [phase]   phase = before | after
set -u
BASE="http://localhost:3001"
PHASE="${1:-before}"
REPORT="runtime-test-report.md"
EMAIL="runtime-${PHASE}-$$@example.com"

# Login and capture JWT (post-fix). Empty if the endpoint doesn't issue tokens.
LOGIN=$(curl -s -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$EMAIL\"}")
TOKEN=$(echo "$LOGIN" | jq -r '.token // empty')
AUTH_HEADER="Authorization: Bearer $TOKEN"

req() { # method path [data] — authenticated
  local method="$1" path="$2" data="${3:-}"
  if [ -n "$data" ]; then
    curl -s -w '\n%{http_code}' -X "$method" "$BASE$path" -H "$AUTH_HEADER" -H 'Content-Type: application/json' -d "$data"
  else
    curl -s -w '\n%{http_code}' -X "$method" "$BASE$path" -H "$AUTH_HEADER"
  fi
}

body() { echo "$1" | sed '$d'; }
code() { echo "$1" | tail -1; }

{
echo ""
echo "## Run: $PHASE ($(date -u +%FT%TZ), user=$EMAIL)"
echo ""

echo "### Auth"
r=$(curl -s -w '\n%{http_code}' "$BASE/api/clients")
echo "- GET /api/clients with no credentials -> $(code "$r") $(body "$r" | head -1)"
r=$(curl -s -w '\n%{http_code}' "$BASE/api/clients" -H "x-user-email: $EMAIL")
echo "- GET /api/clients with only x-user-email (forged identity) -> $(code "$r") $(body "$r" | head -1)"
r=$(curl -s -w '\n%{http_code}' "$BASE/api/clients" -H "Authorization: Bearer forged.jwt.token")
echo "- GET /api/clients with forged Bearer token -> $(code "$r") $(body "$r" | head -1)"
echo "- POST /api/auth/login -> token present: $([ -n "$TOKEN" ] && echo yes || echo no)"
r=$(req GET /api/clients)
echo "- GET /api/clients with Bearer token -> $(code "$r") $(body "$r" | head -1)"

RACE_EMAIL="race-${PHASE}-$$@example.com"
for i in $(seq 1 10); do
  ( curl -s -o "/tmp/race_body_$i.json" -w '%{http_code}' -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d "{\"email\":\"$RACE_EMAIL\"}" > "/tmp/race_code_$i" ) &
done
wait
rcodes=$(cat /tmp/race_code_* | tr '\n' ' ')
echo "- 10 concurrent first logins with same new email ($RACE_EMAIL): $rcodes"
grep -h '"error"' /tmp/race_body_*.json 2>/dev/null | sort | uniq -c | sed 's/^/  /' || true
rm -f /tmp/race_code_* /tmp/race_body_*.json

echo ""
echo "### CRUD: client + work entries"
r=$(req POST /api/clients '{"name":"RT Client","description":"runtime test"}')
CLIENT_ID=$(body "$r" | jq -r '.client.id // .id // empty')
echo "- POST /api/clients -> $(code "$r") id=$CLIENT_ID"

for H in 7.999 0.001 24 25; do
  r=$(req POST /api/work-entries "{\"clientId\":$CLIENT_ID,\"hours\":$H,\"description\":\"hours=$H\",\"date\":\"2024-01-15\"}")
  echo "- POST /api/work-entries hours=$H -> $(code "$r") $(body "$r" | jq -c '{hours:.workEntry.hours,date:.workEntry.date,error:.error,details:.details}' 2>/dev/null || body "$r" | head -1)"
done

r=$(req GET /api/work-entries)
echo "- GET /api/work-entries -> $(code "$r")"
body "$r" | jq -c '.workEntries[] | {id,hours,date}' | sed 's/^/  /'

echo ""
echo "### Orphans: delete client with work entries"
r=$(req GET "/api/reports/client/$CLIENT_ID")
echo "- report before delete -> $(code "$r") totalHours=$(body "$r" | jq -r '.totalHours')"
r=$(req DELETE "/api/clients/$CLIENT_ID")
echo "- DELETE /api/clients/$CLIENT_ID -> $(code "$r") $(body "$r" | head -1)"
r=$(req GET /api/work-entries)
COUNT=$(body "$r" | jq '.workEntries | length')
echo "- GET /api/work-entries after delete -> $(code "$r") visible entries=$COUNT"
if [ -f backend/data/timesheet.db ]; then
  ORPHANS=$(/home/ubuntu/android-sdk/platform-tools/sqlite3 backend/data/timesheet.db "SELECT COUNT(*) FROM work_entries WHERE client_id NOT IN (SELECT id FROM clients)")
  echo "- work_entries rows with no matching client (sqlite file): $ORPHANS"
fi

echo ""
echo "### Reports: float artifacts, PDF, CSV"
r=$(req POST /api/clients '{"name":"RT Report Client"}')
RC_ID=$(body "$r" | jq -r '.client.id // .id // empty')
for H in 0.1 0.2; do
  req POST /api/work-entries "{\"clientId\":$RC_ID,\"hours\":$H,\"date\":\"2024-01-15\"}" > /dev/null
done
r=$(req GET "/api/reports/client/$RC_ID")
echo "- GET /api/reports/client/$RC_ID totalHours=$(body "$r" | jq -r '.totalHours') (0.1+0.2 expected 0.3)"

PDF=/tmp/rt_report_$PHASE.pdf
curl -s -o "$PDF" -w 'pdf http=%{http_code} bytes=%{size_download}\n' "$BASE/api/reports/export/pdf/$RC_ID" -H "$AUTH_HEADER"
head -c 20 "$PDF" | od -c | head -1 | sed 's/^/  pdf magic: /'

CSV=/tmp/rt_report_$PHASE.csv
curl -s -o "$CSV" -w 'csv http=%{http_code} bytes=%{size_download}\n' "$BASE/api/reports/export/csv/$RC_ID" -H "$AUTH_HEADER"
echo "  csv contents:"; sed 's/^/    /' "$CSV" | head -5
if [ -d backend/temp ]; then ls -la backend/temp | tail -3 | sed 's/^/  /'; else echo "  (no backend/temp dir left)"; fi

echo ""
echo "### Malformed IDs"
r=$(req GET /api/work-entries/12abc)
echo "- GET /api/work-entries/12abc -> $(code "$r") $(body "$r" | head -1)"
r=$(req DELETE /api/work-entries/12abc)
echo "- DELETE /api/work-entries/12abc -> $(code "$r") $(body "$r" | head -1)"
r=$(req PUT /api/work-entries/12abc '{"hours":2}')
echo "- PUT /api/work-entries/12abc -> $(code "$r") $(body "$r" | head -1)"
r=$(req GET /api/clients/9xyz)
echo "- GET /api/clients/9xyz -> $(code "$r") $(body "$r" | head -1)"

echo ""
echo "### Rate limit burst"
ok=0; limited=0; other=0
for i in $(seq 1 130); do
  c=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/health")
  case "$c" in 200) ok=$((ok+1));; 429) limited=$((limited+1));; *) other=$((other+1));; esac
done
echo "- 130 sequential GET /health: 200=$ok 429=$limited other=$other"
} | tee -a "$REPORT"
