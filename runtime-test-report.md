# Runtime Test Report — timesheet-app

Exploratory runtime tests against the Express + SQLite backend (port 3001) via `runtime-test.sh` (curl + jq). Frontend dev server on port 5173 proxies `/api` to the backend.

Note: the task description mentions ports 8000/3000; the repo's actual ports are 3001 (backend) and 5173 (frontend) and were used throughout.

## Findings — before vs after

| # | Issue | Before (observed) | After (verified) |
|---|-------|-------------------|------------------|
| 1 | Data loss on restart (in-memory DB) | `GET /api/clients` + `/api/work-entries` returned empty after restart; all data lost | Data at `backend/data/timesheet.db` (`DB_PATH` env override, `:memory:` only under `NODE_ENV=test`); after restart: client + 45 entries + `totalHours=67.5` intact |
| 2 | FK orphans (pragma off) | `DELETE /api/clients/1` returned 200 while work entries remained; `PRAGMA foreign_keys` never enabled. Rows invisible via JOINed endpoints but persisted in `work_entries` | `PRAGMA foreign_keys = ON` at connect + `busyTimeout=5000`; after client delete, sqlite file shows **0** `work_entries` rows without a matching client |
| 3 | Auth bypass via `x-user-email` | Any `x-user-email` header was trusted; no credentials needed → 200 | `x-user-email` alone → 401; forged Bearer → 401; valid JWT from `POST /api/auth/login` → 200 |
| 4 | User-creation race | 10 concurrent first requests, same new email → 1× 500 `{"error":"Failed to create user"}` (SELECT-then-INSERT) | `INSERT OR IGNORE` in middleware + login: 10 concurrent first logins → all 200/201, zero errors |
| 5 | `parseInt` leniency | `GET /api/work-entries/12abc` → 404 (parsed as id 12) instead of 400 | `GET/PUT/DELETE /api/work-entries/12abc` and `GET /api/clients/9xyz` → **400** `{error: "Invalid ... ID"}` (`/^\d+$/` guard) |
| 6 | Float `totalHours` | `0.1 + 0.2` → `totalHours: 0.30000000000000004` | `totalHours: 0.3` (cent-level rounding via `sumHours`) |
| 7 | Silent precision truncation | `hours: 7.999` → 201, stored as `8`; `0.001` → 400 via round-to-0 | `7.999` and `0.001` → 400 `"hours" must have no more than 2 decimal places` (`.strict()` + `.precision(2)`); `24` OK, `25` → 400 |
| 8 | ISO datetime date storage | `date: "2024-01-15"` stored/returned as `1705276800000` (epoch ms) in API, CSV, and PDF | Dates round-trip verbatim as `"2024-01-15"` in API, CSV, and PDF (`Joi.string().pattern()` + calendar-date check; `2024-02-30` rejected) |
| 9 | PDF pagination/formatting | 45 entries → 7 pages; entry crossing page break scattered columns across 3 pages (date p2, hours p3, description p4); hours unformatted | 45 entries → 3 pages, all 45 rows complete with aligned `Date/Hours/Description` columns; hours rendered as `1.50`; `y` captured after `addPage()` |
| 10 | CSV temp-file dependency | CSV written via `csv-writer` to `backend/temp/` + `res.download`/`unlink`; with `temp` path blocked → 500 ENOTDIR | In-memory `csv-stringify` + `res.send` with `Content-Disposition`; no filesystem writes, no `temp/` dir created |
| 11 | Global rate limit | 130 `GET /health` → 65×200, 65×429 (limiter covered everything, per-IP) | Limiter scoped: `GET`/`HEAD`/`OPTIONS` exempt (130×200 on `/health`); mutations → 200/15min keyed per bearer token (199×201 then 21×429); `/api/auth` → 50/15min |
| 12 | Frontend 401/network handling | Interceptor cleared `userEmail` and redirected to `/login` unconditionally; network/timeout errors unnormalized | Bearer token attached from `localStorage.authToken`; 401 redirects only when not already on `/login`; timeouts/network errors normalized into `error.userMessage` |
| 13 | `startServer()` on import | `startServer()` ran unconditionally when `server.js` was required | Guarded by `if (require.main === module)`; `module.exports = app` still available for tests/tooling |

## Raw run logs

---

## Run: before (2026-09-30T08:55:35Z, user=runtime-before-4597@example.com)

### Auth
- GET /api/clients without x-user-email -> 401 {"error":"User email required in x-user-email header"}
- GET /api/clients with x-user-email -> 200 {"clients":[]}
- 10 concurrent first requests with same new email (race-before-4597@example.com): 500200200200200200200200200200
        9 {"clients":[]}
        1 {"error":"Failed to create user"}

### CRUD: client + work entries
- POST /api/clients -> 201 id=1
- POST /api/work-entries hours=7.999 -> 201 {"hours":8,"date":1705276800000,"error":null}
- POST /api/work-entries hours=0.001 -> 400 {"hours":null,"date":null,"error":"Validation error"}
- POST /api/work-entries hours=24 -> 201 {"hours":24,"date":1705276800000,"error":null}
- POST /api/work-entries hours=25 -> 400 {"hours":null,"date":null,"error":"Validation error"}
- GET /api/work-entries -> 200
  {"id":2,"hours":24,"date":1705276800000}
  {"id":1,"hours":8,"date":1705276800000}

### Orphans: delete client with work entries
- report before delete -> 200 totalHours=32
- DELETE /api/clients/1 -> 200 {"message":"Client deleted successfully"}
- GET /api/work-entries after delete -> 200 visible entries=0 (JOIN hides orphans; rows persist in table)

### Reports: float artifacts, PDF, CSV
- GET /api/reports/client/2 totalHours=0.30000000000000004 (0.1+0.2 expected 0.3)
pdf http=200 bytes=1492
csv http=200 bytes=112 — dates written as 1705276800000; `backend/temp/` created and cleaned per request

### Malformed IDs
- GET /api/work-entries/12abc -> 404 {"error":"Work entry not found"}
- DELETE /api/work-entries/12abc -> 404 {"error":"Work entry not found"}
- PUT /api/work-entries/12abc -> 404 {"error":"Work entry not found"}
- GET /api/clients/9xyz -> 404 {"error":"Client not found"}

### Rate limit burst
- 130 sequential GET /health: 200=65 429=65 other=0

### Restart: data loss
- Backend restarted (in-memory SQLite): GET /api/clients and /api/work-entries for prior users -> 200 with empty lists. All data lost.

### PDF pagination (45 entries, one client)
- 7 pages; entry crossing each page break has columns scattered: page 2 = only the date, page 3 = only "1.5", page 4 starts with "entry 18". Cause: stale `y` captured before `doc.addPage()`.

### CSV temp-file dependency
- With `backend/temp` replaced by a regular file: GET /api/reports/export/csv/1 -> 500 {"error":"Failed to generate CSV report"} (ENOTDIR).

---

## Run: after (2026-09-30T09:01:19Z, user=runtime-after-8470@example.com)

### Auth
- GET /api/clients with no credentials -> 401 {"error":"Authorization Bearer token required"}
- GET /api/clients with only x-user-email (forged identity) -> 401 {"error":"Authorization Bearer token required"}
- GET /api/clients with forged Bearer token -> 401 {"error":"Invalid or expired token"}
- POST /api/auth/login -> token present: yes
- GET /api/clients with Bearer token -> 200 {"clients":[]}
- 10 concurrent first logins with same new email: 201 200 200 200 200 200 200 200 200 200

### CRUD: client + work entries
- POST /api/clients -> 201 id=1
- POST /api/work-entries hours=7.999 -> 400 {"error":"Validation error","details":["\"hours\" must have no more than 2 decimal places"]}
- POST /api/work-entries hours=0.001 -> 400 {"error":"Validation error","details":["\"hours\" must have no more than 2 decimal places"]}
- POST /api/work-entries hours=24 -> 201 {"hours":24,"date":"2024-01-15"}
- POST /api/work-entries hours=25 -> 400 {"error":"Validation error","details":["\"hours\" must be less than or equal to 24"]}
- GET /api/work-entries -> 200 — {"id":1,"hours":24,"date":"2024-01-15"}

### Orphans: delete client with work entries
- report before delete -> 200 totalHours=24
- DELETE /api/clients/1 -> 200 {"message":"Client deleted successfully"}
- GET /api/work-entries after delete -> 200 visible entries=0
- work_entries rows with no matching client (sqlite file): 0

### Reports: float artifacts, PDF, CSV
- GET /api/reports/client/2 totalHours=0.3 (0.1+0.2 expected 0.3)
- pdf http=200 bytes=1477 (%PDF-1.3)
- csv http=200 bytes=106 — Date column shows 2024-01-15; generated in memory, no temp dir
- PDF pagination re-verified with 45 entries: 3 pages, all 45 rows complete and column-aligned (17 + 22 + 6)

### Malformed IDs
- GET /api/work-entries/12abc -> 400 {"error":"Invalid work entry ID"}
- DELETE /api/work-entries/12abc -> 400 {"error":"Invalid work entry ID"}
- PUT /api/work-entries/12abc -> 400 {"error":"Invalid work entry ID"}
- GET /api/clients/9xyz -> 400 {"error":"Invalid client ID"}

### Rate limit
- 130 sequential GET /health: 200=130 429=0 (GETs exempt)
- 220 sequential POST /api/work-entries (same token): 201=199, 429=21 (200/15min per token, incl. prior mutation)

### Restart: persistence
- Backend restarted; `GET /api/clients` and `/api/work-entries` for prior user still return the client (id=3) and all 45 entries; `GET /api/reports/client/3` totalHours=67.5.

## Backend unit tests

`cd backend && npm test` — 8/8 suites, 163/163 tests pass (auth middleware/route tests rewritten for JWT; reports tests updated for in-memory CSV; new tests for float `totalHours`, forged/expired/wrong-secret tokens, `INSERT OR IGNORE`).
