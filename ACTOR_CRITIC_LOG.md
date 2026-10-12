# Actor-Critic Log — Work Entry Category Feature

Feature: optional `category` on timesheet work entries, fixed list
`Development`, `Meeting`, `Design`, `Testing`, `Other`, shown as a dropdown in the UI.

Process: 3 rounds. In each round the **ACTOR** changes code; the **CRITIC** then validates independently
(no source edits: only runs checks and records findings). Each later ACTOR fixes every open finding before adding anything new.

Baseline on `main` before Round 1: backend `npm test` 161/161 passing; frontend `npm run build` and `npm run lint` clean.

Critic helper scripts (stored outside the repo, copied verbatim in the [Appendix](#appendix--critic-scripts)):
- `edge_cases.sh` — live HTTP checks against a real backend (real `sqlite3`, in-memory DB), started with `PORT=3101 node src/server.js`
- `docker_upgrade_check.sh` — runs `docker/overrides/database/init.js` against a file DB built with the old (pre-category) schema

---

## Round 1

### ACTOR — changes (commit `a2dff53`)
- **DB**: `category TEXT` column in `CREATE TABLE IF NOT EXISTS work_entries` and `idx_work_entries_category` index, in both `backend/src/database/init.js` and `docker/overrides/database/init.js`.
- **Validation**: `WORK_ENTRY_CATEGORIES` constant exported from `backend/src/validation/schemas.js`; `category: Joi.string().valid(...WORK_ENTRY_CATEGORIES).optional().allow('')` on `workEntrySchema` and `updateWorkEntrySchema`.
- **Routes** (`workEntries.js`): `we.category` in all 4 SELECTs (list, get-by-id, post-create and post-update re-fetches); `category` in the INSERT (`'' → NULL`); `performUpdate()` sets `category = ?` (`'' → NULL`, so an update can clear it); `GET /?category=` filter that returns 400 `Invalid category` for values outside the list.
- **Reports** (`reports.js`): `category` in the client-report, CSV and PDF SELECTs; `Category` CSV column; PDF table re-laid out to Date / Hours / Category / Description.
- **Frontend**: `WORK_ENTRY_CATEGORIES` (`as const`) + `WorkEntryCategory` in `types/api.ts`; `category` on `WorkEntry`, `CreateWorkEntryRequest`, `UpdateWorkEntryRequest`; `api/client.ts` create/update param types; `WorkEntriesPage.tsx` form state + resets + edit populate + `entryData` + mutation types + Category Chip column + Category `Select` (with a "None" option).
- **Tests/docs**: extended `schemas.test.js`, `workEntries.test.js`, `init.test.js`, `reports.test.js` (161 → 189 tests); `backend/README.md` schema + endpoint docs.

### CRITIC — validation

| # | Command | Result | Verdict |
|---|---|---|---|
| 1 | `cd backend && npm test` | `Test Suites: 8 passed, 8 total` / `Tests: 189 passed, 189 total` | PASS |
| 2 | `cd frontend && npm run build` (`tsc -b && vite build`) | `✓ built in 5.00s`, exit 0 (only the existing >500 kB chunk-size warning) | PASS |
| 3 | `cd frontend && npm run lint` | exit 0, no findings | PASS |
| 4 | Layer grep (below) | category present in every specified layer | PASS |
| 5 | `edge_cases.sh` (live API) | `TOTAL: 26 passed, 1 failed` | FAIL (1) |
| 6 | Legacy file-DB upgrade (`docker_upgrade_check.sh` predecessor) | `SQLITE_ERROR: no such column: category` — unhandled, process crashes | FAIL |
| 7 | Manual diff review (frontend pages / types / comments) | Category missing from Reports page UI; unused type export; stale comment | findings |

Layer grep commands and results (check 4):
```
grep -n category backend/src/database/init.js docker/overrides/database/init.js
  -> each file: line "category TEXT," + "CREATE INDEX IF NOT EXISTS idx_work_entries_category ..."     ✔
grep -n category backend/src/validation/schemas.js
  -> 16: workEntrySchema category ...valid(...WORK_ENTRY_CATEGORIES)...  24: updateWorkEntrySchema   ✔
grep -n "we.category\|INSERT INTO\|category = ?" backend/src/routes/workEntries.js
  -> 17 list SELECT, 39 filter, 66 get-by-id SELECT, 114 INSERT, 124 post-create SELECT,
     224 performUpdate, 246 post-update SELECT                                                       ✔
grep -n category backend/src/routes/reports.js
  -> 40 / 92 / 176 SELECTs, 119 CSV header, 231 PDF row                                              ✔
grep -n category frontend/src/types/api.ts frontend/src/api/client.ts
  -> WorkEntry:24, CreateWorkEntryRequest:60, UpdateWorkEntryRequest:68; client.ts:101, 106          ✔
grep -c category frontend/src/pages/WorkEntriesPage.tsx
  -> 16 (state, resets, edit populate, entryData, mutation types, table Chip, dialog Select)          ✔
```

Live API edge cases (check 5), `PORT=3101 node src/server.js` then `edge_cases.sh`:
```
PASS  POST invalid category 'Lunch' -> 400 (got 400)
PASS  POST wrong-case 'development' -> 400 (got 400)
PASS  POST omitted category -> 201 (got 201)
PASS  omitted category stored as null (got null)
PASS  POST empty category '' -> 201 (got 201)
PASS  empty category stored as null (got null)
PASS  POST category Design -> 201 (got 201)
PASS  create->get round-trip (Design) (got Design)
PASS  PUT category Testing -> 200 (got 200)
PASS  update->get round-trip (Testing) (got Testing)
PASS  PUT invalid category -> 400 (got 400)
PASS  PUT invalid category leaves value unchanged (got Testing)
PASS  PUT category Meeting -> 200 (got 200)
PASS  update '' -> get returns null (got null)
PASS  GET ?category=Testing -> 200 (got 200)
PASS  filter returns only Testing entries (got true)
PASS  filter count = 1 (got 1)
PASS  GET ?category=Other (none) -> empty list (got 0)
PASS  GET ?category=Bogus -> 400 (got 400)
PASS  GET ?clientId=1&category=Testing -> 1 (got 1)
PASS  GET unfiltered returns all 3 (got 3)
PASS  other user's filter sees nothing (isolation) (got 0)
FAIL  GET ?category= (empty) treated like ?clientId= (no filter) -> 200 (expected 200, got 400)
PASS  client report includes category (got true)
PASS  CSV header has Category column (got Date,Hours,Category,Description,Created At)
PASS  CSV row contains Testing (got 1)
PASS  PDF export -> 200 application/pdf (got 200 application/pdf)
TOTAL: 26 passed, 1 failed
```

Legacy DB upgrade (check 6): built a file DB with the pre-change `work_entries` schema, then ran
`DATABASE_PATH=/tmp/legacy.db` + `initializeDatabase()` from `docker/overrides/database/init.js`:
```
legacy db (pre-category schema) created
[Error: SQLITE_ERROR: no such column: category
Emitted 'error' event on Statement instance at:
] { errno: 1, code: 'SQLITE_ERROR' }
```

### Findings carried into Round 2
| ID | Severity | Finding |
|---|---|---|
| R1-F1 | High | **Existing file DBs crash on startup.** Docker uses a file DB (`DATABASE_PATH`). On a DB created before this change, `CREATE TABLE IF NOT EXISTS` does nothing, so the column is never added and `CREATE INDEX idx_work_entries_category` throws an unhandled `SQLITE_ERROR: no such column: category`. Any query that reads `we.category` would fail too. Needs an idempotent `ALTER TABLE ... ADD COLUMN` migration (both init.js files) plus tests. |
| R1-F2 | Low | `GET /api/work-entries?category=` (empty) returns 400, but an empty `?clientId=` is ignored, so the filter does not mirror `clientId` as specified. |
| R1-F3 | Medium | `frontend/src/pages/ReportsPage.tsx` client-report table has no Category column, even though `/api/reports/client/:id` now returns `category`. The UI and the report API disagree. |
| R1-F4 | Low | `WorkEntryCategory` is exported from `frontend/src/types/api.ts` but nothing uses it; the form state types `category` as a plain `string`. |
| R1-F5 | Low | Stale comment in `workEntries.js`: `// Get all work entries ... (with optional client filter)` does not mention the category filter. |

---

## Round 2

### ACTOR — changes (commit `ea07a87`)
Fixed all five Round 1 findings; nothing new added.
- **R1-F1**: both `init.js` files now run an idempotent `ALTER TABLE work_entries ADD COLUMN category TEXT` inside `serialize()`, after the work_entries CREATE TABLE and before the indexes. A `duplicate column name` error is ignored; any other error is logged. Three `init.test.js` tests cover this, and the README notes the auto-upgrade.
- **R1-F2**: list filter is now `if (category)`, so an empty `?category=` is ignored like `?clientId=`. Non-empty values outside the list, and repeated params (which arrive as an array), still return 400. Tests added.
- **R1-F3**: `ReportsPage.tsx` gets a Category column (same Chip rendering as Work Entries), and the empty-state `colSpan` goes 4 → 5.
- **R1-F4**: `formData.category` in `WorkEntriesPage.tsx` is now typed `WorkEntryCategory | ''`.
- **R1-F5**: route comment updated.
- Tests 189 → 194.

### CRITIC — validation

| # | Command | Result | Verdict |
|---|---|---|---|
| 1 | `cd backend && npm test` | `Tests: 194 passed, 194 total` (8/8 suites) | PASS |
| 2 | `cd frontend && npm run build` | `✓ built in 5.33s`, exit 0 | PASS |
| 3 | `cd frontend && npm run lint` | exit 0 | PASS |
| 4 | Layer grep (same commands as Round 1) | all layers still present, plus the `ALTER TABLE` line in both init.js files | PASS |
| 5 | `edge_cases.sh` (live API, real sqlite3) | `TOTAL: 27 passed, 0 failed` | PASS |
| 6 | `docker_upgrade_check.sh` (legacy file DB) | upgrade OK, index created, 2nd startup OK (output below) | PASS |
| 7 | Category list consistency (node script comparing backend `WORK_ENTRY_CATEGORIES` with the frontend `types/api.ts` array) | `identical: true` | PASS |
| 8 | `grep -rn "TODO\|FIXME\|XXX" backend/src frontend/src docker` | no matches | PASS |
| 9 | Rendered UI check in Chrome (backend :3001, vite :5173) | create/edit/clear work end to end; one UX defect (below) | findings |

Round 2 edge cases explicitly requested, all confirmed live (check 5):
- invalid category rejected by the API with 400: `POST 'Lunch'`, `POST 'development'`, `PUT 'Coffee'` (value left unchanged), `GET ?category=Bogus`
- empty/omitted category accepted: `POST` without category → 201 / null; `POST ''` → 201 / null; `PUT ''` clears to null; `GET ?category=` → 200
- round-trips: create→get `Design`; update→get `Testing`; update `''`→get `null`
- filter: `?category=Testing` returns exactly the 1 Testing entry; `?category=Other` returns 0; `clientId`+`category` combined returns 1; another user gets 0 (user isolation)

`edge_cases.sh` output:
```
PASS  POST invalid category 'Lunch' -> 400 (got 400)
PASS  POST wrong-case 'development' -> 400 (got 400)
PASS  POST omitted category -> 201 (got 201)
PASS  omitted category stored as null (got null)
PASS  POST empty category '' -> 201 (got 201)
PASS  empty category stored as null (got null)
PASS  POST category Design -> 201 (got 201)
PASS  create->get round-trip (Design) (got Design)
PASS  PUT category Testing -> 200 (got 200)
PASS  update->get round-trip (Testing) (got Testing)
PASS  PUT invalid category -> 400 (got 400)
PASS  PUT invalid category leaves value unchanged (got Testing)
PASS  PUT category Meeting -> 200 (got 200)
PASS  update '' -> get returns null (got null)
PASS  GET ?category=Testing -> 200 (got 200)
PASS  filter returns only Testing entries (got true)
PASS  filter count = 1 (got 1)
PASS  GET ?category=Other (none) -> empty list (got 0)
PASS  GET ?category=Bogus -> 400 (got 400)
PASS  GET ?clientId=1&category=Testing -> 1 (got 1)
PASS  GET unfiltered returns all 3 (got 3)
PASS  other user's filter sees nothing (isolation) (got 0)
PASS  GET ?category= (empty) treated like ?clientId= (no filter) -> 200 (got 200)
PASS  client report includes category (got true)
PASS  CSV header has Category column (got Date,Hours,Category,Description,Created At)
PASS  CSV row contains Testing (got 1)
PASS  PDF export -> 200 application/pdf (got 200 application/pdf)
TOTAL: 27 passed, 0 failed
```

`docker_upgrade_check.sh` output:
```
legacy db (pre-category schema, 1 row) created
SELECT category on upgraded DB -> OK [{"id":1,"category":null}]
idx_work_entries_category exists -> yes
second startup (idempotent) -> OK
```

Rendered UI (check 9): the Work Entries table shows a Category chip column ("Development" / "None"). The dialog dropdown lists None, Development, Meeting, Design, Testing, Other. Editing an entry from Development to None and clicking Update cleared it (the table chip now reads None). Creating an entry with Meeting stored `category: "Meeting"` (confirmed via `GET /api/work-entries`). The Reports page shows the new Category column (Meeting / None / None).

### Findings carried into Round 3
| ID | Severity | Finding |
|---|---|---|
| R2-F1 | Low (UX) | In the Work Entries dialog, picking "None" (value `''`) leaves the Category field **blank** and the label drops back into the field, so the user never sees "None". The Reports page client picker shows its empty value ("Choose a client..."); this select should do the same. |
| R2-F2 | Low (docs) | In `backend/README.md`, "This column is automatically added to existing databases on startup." is its own bullet in the column list. It reads like a column; fold it into the `category` bullet. |
| R2-F3 | Low (tests) | The new `init.test.js` upgrade-error tests only work because the ALTER happens to be the 4th `db.run` call (chained `mockImplementationOnce`). Reordering statements would silently break them; they should match on the query text. |
| R2-F4 | Low (types) | `(entry.category \|\| '') as WorkEntryCategory \| ''` casts server data without checking it. Use a type guard. |
| — | Polish (user-requested) | Keep the category list consistent across frontend/backend (currently identical; add sync comments), docs accurate, no leftover TODOs. |

---

## Round 3 (final)

### ACTOR — changes (commit `92b64ee`)
Fixed all four Round 2 findings and did the requested polish. No new scope.
- **R2-F1**: the Category `Select` in `WorkEntriesPage.tsx` now has `displayEmpty`, `notched` and `renderValue={(v) => v || 'None'}`, and its `InputLabel` has `shrink`, so an empty category reads "None" with the label kept in the outline.
- **R2-F2**: `backend/README.md` now folds the auto-upgrade note into the `category` column bullet.
- **R2-F3**: the `init.test.js` upgrade-error tests now use one `db.run.mockImplementation` that returns the error only when the query starts with `ALTER TABLE work_entries ADD COLUMN category`, so statement order no longer matters.
- **R2-F4**: `frontend/src/types/api.ts` exports `isWorkEntryCategory(value: unknown): value is WorkEntryCategory`. `handleOpen` and the Select `onChange` use it instead of the unchecked cast.
- **Polish**: both `WORK_ENTRY_CATEGORIES` definitions (`backend/src/validation/schemas.js`, `frontend/src/types/api.ts`) now have a "keep in sync" comment pointing at each other. No TODO/FIXME added.

### CRITIC — final validation gate (all on `92b64ee`)

| # | Check | Command | Output | Verdict |
|---|---|---|---|---|
| 1 | Backend tests | `cd backend && npm test` | `Test Suites: 8 passed, 8 total` / `Tests: 194 passed, 194 total` | **PASS** |
| 2 | Frontend build | `cd frontend && npm run build` | `✓ built in 5.91s`, exit 0 (only the existing >500 kB chunk advisory) | **PASS** |
| 3 | Frontend lint | `cd frontend && npm run lint` | `eslint .` exit 0, no errors/warnings (only the `baseline-browser-mapping` data-age notice) | **PASS** |
| 4 | Round 2 edge cases (live API) | `PORT=3101 node src/server.js` + `~/critic/edge_cases.sh` | `TOTAL: 27 passed, 0 failed` (same 27 checks as Round 2) | **PASS** |
| 5 | Legacy DB upgrade | `~/critic/docker_upgrade_check.sh` | `SELECT category on upgraded DB -> OK`, `idx_work_entries_category exists -> yes`, `second startup (idempotent) -> OK` | **PASS** |
| 6 | Category list consistent FE/BE | node script comparing both `WORK_ENTRY_CATEGORIES` arrays | `["Development","Meeting","Design","Testing","Other"]` on both, `identical: true` | **PASS** |
| 7 | Docs accurate | `grep -n category backend/README.md` | endpoint documents `?clientId=&category=`; column bullet lists the fixed values + auto-upgrade | **PASS** |
| 8 | No leftover TODOs | `grep -rnE "TODO\|FIXME\|XXX" backend/src frontend/src docker` | no matches | **PASS** |
| 9 | Whitespace | `git diff --check main..HEAD` | clean | **PASS** |
| 10 | Review conventions (`/review` skill) | `git diff main..HEAD` review | every new SQL uses `?` and stays inside the existing `user_email`-scoped queries; Joi validates category; no `any` in the frontend diff; `{ error }` / `{ workEntries }` envelopes unchanged | **PASS** |
| 11 | R2-F1 rendered | Chrome, Work Entries → edit | uncategorized entry shows "Category: None" with label notched; Meeting entry shows "Meeting" | **PASS** |

Round 2 edge cases confirmed again:
- invalid value → 400 (`Lunch`, `development`, `PUT Coffee`, `?category=Bogus`)
- omitted/empty → accepted, stored as null
- create→get round-trip (`Design`) and update→get round-trip (`Testing`, then `''` → null)
- filter returns only matching entries (Testing = 1, Other = 0, combined with `clientId` = 1, other user = 0)

### Findings
None open. All findings from Rounds 1–2 (R1-F1…F5, R2-F1…F4) are resolved.

### Final result: **PASS**

---

## Appendix — critic scripts

### `edge_cases.sh`
```bash
#!/usr/bin/env bash
# Critic live API edge-case checks against a running backend (real sqlite3, in-memory DB).
B=${B:-http://localhost:3101}; U="x-user-email: critic@example.com"; J="Content-Type: application/json"
pass=0; fail=0
check() { if [ "$2" = "$3" ]; then echo "PASS  $1 (got $2)"; pass=$((pass+1)); else echo "FAIL  $1 (expected $3, got $2)"; fail=$((fail+1)); fi; }
CID=$(curl -s -X POST $B/api/clients -H "$U" -H "$J" -d '{"name":"Critic Co"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).client.id')
code() { curl -s -o /tmp/resp.json -w '%{http_code}' "$@"; }
field() { node -pe "const r=JSON.parse(require('fs').readFileSync('/tmp/resp.json'));$1"; }
check "POST invalid category 'Lunch' -> 400" $(code -X POST $B/api/work-entries -H "$U" -H "$J" -d "{\"clientId\":$CID,\"hours\":1,\"date\":\"2026-10-01\",\"category\":\"Lunch\"}") 400
check "POST wrong-case 'development' -> 400" $(code -X POST $B/api/work-entries -H "$U" -H "$J" -d "{\"clientId\":$CID,\"hours\":1,\"date\":\"2026-10-01\",\"category\":\"development\"}") 400
check "POST omitted category -> 201" $(code -X POST $B/api/work-entries -H "$U" -H "$J" -d "{\"clientId\":$CID,\"hours\":1,\"date\":\"2026-10-01\"}") 201
OMIT=$(field 'r.workEntry.id'); check "omitted category stored as null" "$(field 'String(r.workEntry.category)')" null
check "POST empty category '' -> 201" $(code -X POST $B/api/work-entries -H "$U" -H "$J" -d "{\"clientId\":$CID,\"hours\":2,\"date\":\"2026-10-02\",\"category\":\"\"}") 201
check "empty category stored as null" "$(field 'String(r.workEntry.category)')" null
check "POST category Design -> 201" $(code -X POST $B/api/work-entries -H "$U" -H "$J" -d "{\"clientId\":$CID,\"hours\":3,\"date\":\"2026-10-03\",\"category\":\"Design\"}") 201
DID=$(field 'r.workEntry.id')
check "create->get round-trip (Design)" "$(code $B/api/work-entries/$DID -H "$U" >/dev/null; field 'r.workEntry.category')" Design
check "PUT category Testing -> 200" $(code -X PUT $B/api/work-entries/$DID -H "$U" -H "$J" -d '{"category":"Testing"}') 200
check "update->get round-trip (Testing)" "$(code $B/api/work-entries/$DID -H "$U" >/dev/null; field 'r.workEntry.category')" Testing
check "PUT invalid category -> 400" $(code -X PUT $B/api/work-entries/$DID -H "$U" -H "$J" -d '{"category":"Coffee"}') 400
check "PUT invalid category leaves value unchanged" "$(code $B/api/work-entries/$DID -H "$U" >/dev/null; field 'r.workEntry.category')" Testing
check "PUT category Meeting -> 200" $(code -X PUT $B/api/work-entries/$OMIT -H "$U" -H "$J" -d '{"category":"Meeting"}') 200
code -X PUT $B/api/work-entries/$OMIT -H "$U" -H "$J" -d '{"category":""}' >/dev/null
check "update '' -> get returns null" "$(code $B/api/work-entries/$OMIT -H "$U" >/dev/null; field 'String(r.workEntry.category)')" null
check "GET ?category=Testing -> 200" $(code "$B/api/work-entries?category=Testing" -H "$U") 200
check "filter returns only Testing entries" "$(field 'r.workEntries.length>0 && r.workEntries.every(e=>e.category==="Testing")')" true
check "filter count = 1" "$(field 'r.workEntries.length')" 1
check "GET ?category=Other (none) -> empty list" "$(code "$B/api/work-entries?category=Other" -H "$U" >/dev/null; field 'r.workEntries.length')" 0
check "GET ?category=Bogus -> 400" $(code "$B/api/work-entries?category=Bogus" -H "$U") 400
check "GET ?clientId=$CID&category=Testing -> 1" "$(code "$B/api/work-entries?clientId=$CID&category=Testing" -H "$U" >/dev/null; field 'r.workEntries.length')" 1
check "GET unfiltered returns all 3" "$(code "$B/api/work-entries" -H "$U" >/dev/null; field 'r.workEntries.length')" 3
check "other user's filter sees nothing (isolation)" "$(code "$B/api/work-entries?category=Testing" -H 'x-user-email: other@example.com' >/dev/null; field 'r.workEntries.length')" 0
check "GET ?category= (empty) treated like ?clientId= (no filter) -> 200" $(code "$B/api/work-entries?category=" -H "$U") 200
check "client report includes category" "$(code $B/api/reports/client/$CID -H "$U" >/dev/null; field 'r.workEntries.some(e=>e.category==="Testing")')" true
curl -s $B/api/reports/export/csv/$CID -H "$U" -o /tmp/report.csv
check "CSV header has Category column" "$(head -1 /tmp/report.csv)" "Date,Hours,Category,Description,Created At"
check "CSV row contains Testing" "$(grep -c Testing /tmp/report.csv)" 1
check "PDF export -> 200 application/pdf" "$(curl -s -o /tmp/report.pdf -w '%{http_code} %{content_type}' $B/api/reports/export/pdf/$CID -H "$U")" "200 application/pdf"
echo "TOTAL: $pass passed, $fail failed"
```

### `docker_upgrade_check.sh`
```bash
#!/usr/bin/env bash
# Critic check: run docker/overrides/database/init.js against a file DB created with the pre-category schema.
set -u
cd "$(git -C ~/repos/timesheet-app rev-parse --show-toplevel)/backend"
rm -f /tmp/legacy.db
node -e "
const sqlite3=require('sqlite3');const db=new sqlite3.Database('/tmp/legacy.db');
db.serialize(()=>{db.run('CREATE TABLE users(email TEXT PRIMARY KEY, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.run('CREATE TABLE clients(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,description TEXT,user_email TEXT NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.run('CREATE TABLE work_entries(id INTEGER PRIMARY KEY AUTOINCREMENT,client_id INTEGER NOT NULL,user_email TEXT NOT NULL,hours DECIMAL(5,2) NOT NULL,description TEXT,date DATE NOT NULL,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
db.run(\"INSERT INTO work_entries(client_id,user_email,hours,date) VALUES (1,'a@b.c',1,'2026-01-01')\");});
db.close(()=>console.log('legacy db (pre-category schema, 1 row) created'));"
cp ../docker/overrides/database/init.js /tmp/docker-init.js
sed -i "s#require('sqlite3')#require('$PWD/node_modules/sqlite3')#" /tmp/docker-init.js
DATABASE_PATH=/tmp/legacy.db node -e "
const {initializeDatabase,getDatabase}=require('/tmp/docker-init.js');
initializeDatabase().then(()=>setTimeout(()=>{const db=getDatabase();
db.all('SELECT id, category FROM work_entries',[],(e,r)=>{console.log('SELECT category on upgraded DB ->', e?('ERROR: '+e.message):('OK '+JSON.stringify(r)));
db.all(\"SELECT name FROM sqlite_master WHERE type='index' AND name='idx_work_entries_category'\",[],(e2,r2)=>{console.log('idx_work_entries_category exists ->', r2&&r2.length?'yes':'no');
initializeDatabase().then(()=>setTimeout(()=>{console.log('second startup (idempotent) -> OK');process.exit(0)},300));});});},300));
" 2>&1 | grep -v "^Connected\|created successfully"
```
