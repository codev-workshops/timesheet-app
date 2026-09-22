# Test Quality Audit Report — timesheet-app

Date: 2026-09-22
Revision audited: `82cdf7c82d539be2857ca978acf96a3c8f717108` (`main`)
Baseline: 80% coverage on statements / branches / functions / lines (project Quality Gate)

---

## Executive Summary

- The backend Jest suite runs green: **8/8 suites, 161/161 tests passed** (`cd backend && npm run test:coverage`).
- **Global backend coverage is above the 80% baseline** on all four metrics: statements 86.98%, branches 88.38%, functions 88.23%, lines 87.14%. The configured `coverageThreshold` in `backend/jest.config.js` (60/65/60/60) is well below both the measured numbers and the 80% baseline and should be raised.
- **Per-file, the project does NOT meet the 80% baseline.** Two of nine source files fail: `src/routes/reports.js` (~64% statements/lines, 69% branches, 69% functions) and `src/config/production.js` (0% statements/lines). `src/database/init.js` also fails on branches (71.42%).
- **The frontend (`frontend/`) has no test suite at all** (no test script in `frontend/package.json`, no `*.test.*`/`*.spec.*` files under `frontend/src`). Its effective coverage is 0%, so the project as a whole is far from an 80% baseline.
- The headline numbers overstate real assurance: several test blocks can never fail (tautological or error-path-only "success path" tests, assertions buried inside mock callbacks that are never invoked), the auth middleware is mocked in every route test, and the CSV/PDF export success code in `reports.js` is never executed.

**Overall verdict against the 80% baseline: FAIL** (global backend numbers pass, but per-file backend coverage and the untested frontend do not).

---

## Test Suite Run Results

Command: `cd backend && npm install && npm run test:coverage` (`jest --coverage`)

| Item | Result |
|---|---|
| Test suites | 8 passed, 8 total |
| Tests | 161 passed, 161 total, 0 failed, 0 skipped |
| Snapshots | 0 |
| Wall time | ~1.2 s |
| Threshold check (60/65/60/60) | Passed (exit code 0) |

Suites executed:

| Suite | Status |
|---|---|
| `src/__tests__/database/init.test.js` | PASS |
| `src/__tests__/middleware/auth.test.js` | PASS |
| `src/__tests__/middleware/errorHandler.test.js` | PASS |
| `src/__tests__/validation/schemas.test.js` | PASS |
| `src/__tests__/routes/auth.test.js` | PASS |
| `src/__tests__/routes/clients.test.js` | PASS |
| `src/__tests__/routes/reports.test.js` | PASS |
| `src/__tests__/routes/workEntries.test.js` | PASS |

---

## Coverage Report vs. 80% Baseline

Scope: `backend/src/**/*.js` excluding `src/server.js` (per `collectCoverageFrom`). PASS = all four metrics ≥ 80%.

| File | % Stmts | % Branch | % Funcs | % Lines | vs 80% | Shortfall (metric: gap) |
|---|---:|---:|---:|---:|---|---|
| **All files (global)** | 86.98 | 88.38 | 88.23 | 87.14 | **PASS** | — |
| `config/production.js` | 0.00 | 100 | 100 | 0.00 | **FAIL** | stmts −80.0, lines −80.0 |
| `database/init.js` | 85.71 | 71.42 | 88.88 | 85.71 | **FAIL** | branches −8.58 |
| `middleware/auth.js` | 100 | 100 | 100 | 100 | PASS | — |
| `middleware/errorHandler.js` | 100 | 100 | 100 | 100 | PASS | — |
| `routes/auth.js` | 100 | 100 | 100 | 100 | PASS | — |
| `routes/clients.js` | 88.88 | 85.71 | 87.50 | 88.88 | PASS | — |
| `routes/reports.js` | 64.15 | 69.44 | 68.75 | 64.42 | **FAIL** | stmts −15.85, branches −10.56, funcs −11.25, lines −15.58 |
| `routes/workEntries.js` | 98.41 | 100 | 100 | 98.41 | PASS | — |
| `validation/schemas.js` | 100 | 100 | 100 | 100 | PASS | — |
| `frontend/` (all files) | 0 | 0 | 0 | 0 | **FAIL** | no test suite exists |

Per-metric global result:

| Metric | Measured | Configured threshold | 80% baseline |
|---|---:|---:|---|
| Statements | 86.98 | 60 | PASS |
| Branches | 88.38 | 60 | PASS |
| Functions | 88.23 | 65 | PASS |
| Lines | 87.14 | 60 | PASS |

Files below 80% and why:

1. **`routes/reports.js` — uncovered lines 127–134, 187–240.** These are the CSV `res.download` + temp-file cleanup path and the entire PDF generation body (headers, table, pagination, `doc.end()`). The "Success Path" tests force errors before reaching this code (see Sections 5–6).
2. **`config/production.js` — line 4 uncovered (0%).** The module is never required by any test (nor, apparently, by any runtime code path under test). Note: this file contains hardcoded JWT/DB/SendGrid credential literals and should be moved to environment variables regardless of coverage; it is a security concern, not just a coverage gap.
3. **`database/init.js` — branches 71.42%; uncovered lines 91–97, 102–103.** The error branches of table-creation / close callbacks are not exercised because the sqlite3 driver is fully mocked.

**Overall verdict:** the backend passes 80% globally but fails per-file; the frontend has zero coverage. The project does not meet an 80% baseline applied per-file or across the whole repository.

---

## Section 1: Test Files Not Updated in 6+ Months

Cannot be determined from this repository. `git log` contains a single squashed sync commit:

```
82cdf7c Sync content from Cognition-Partner-Workshops/timesheet-app@main  (2026-09-03)
```

Every file, including all eight test files, therefore shares the same 2026-09-03 timestamp, and per-file staleness is unknowable here. **Recommendation:** run `git log --format='%ad' -1 -- <file>` against the upstream repository `Cognition-Partner-Workshops/timesheet-app` to identify test files older than six months.

---

## Section 2: Outdated Tests Not Covering Actual Business Flows

| Gap | Evidence |
|---|---|
| Client `department` / `email` fields untested | `backend/src/validation/schemas.js` (`clientSchema`) and `backend/src/routes/clients.js` (INSERT/UPDATE) handle `department` and `email`, but no test in `clients.test.js` or `schemas.test.js` sends, validates, or asserts these fields. Tests reflect an earlier `name`-only client model. |
| Report export "success path" tests only assert error branches | The `CSV Export Success Path` and `PDF Export Success Path` describe blocks in `reports.test.js` drive the request into a DB or writer error, then assert on the 500 response / error structure. The real success branch (`res.download`, PDF piping) is never reached — confirmed by uncovered lines 127–134 and 187–240. |

---

## Section 3: Business Flows Not Covered

- `DELETE /api/clients` bulk delete (`clients.js` lines 185, 191–202 uncovered).
- Cascade deletion of work entries when a client is deleted (only the client row deletion is asserted).
- CSV export success output (file contents, headers, `Content-Disposition`, temp-file cleanup).
- PDF export success output (headers, totals, table rows, `doc.end()`).
- `clientId` filter success on reports/work entries (assertion is buried in a mock callback — see Section 5).
- Cross-user data isolation for mutations (PUT/DELETE by user B on user A's rows) — only reads are checked, and only weakly.
- Integration-level authentication: `authenticateToken` / auth middleware is `jest.mock`ed in every route test, so no route test proves that an unauthenticated request is rejected end-to-end.
- Frontend: no unit, component, or E2E tests exist for `frontend/src` (pages, hooks, API layer).

---

## Section 4: Missing Edge Cases / Boundary Conditions

- `hours` boundaries: exactly `0` and exactly `24` (only `>24` and negative are tested).
- `precision(2)` rounding on `hours` (e.g. `1.005`, `1.999`).
- String max boundaries: 255 (`name`, `email`, `department`) and 1000 (`description`) — exact-length and length+1 cases.
- Name min boundary: length 1 vs. empty string / whitespace-only.
- Dates: far-future and far-past dates, invalid calendar dates (`2024-02-30`).
- Floating-point summation of `hours` in `reports.js` (`reduce(... + parseFloat(entry.hours))`) — e.g. `0.1 + 0.2` and `toFixed(2)` output.
- PDF pagination branch (`if (y > 700) doc.addPage()`) — never exercised because PDFKit is mocked and the success path is never reached.
- Divergent email validators: regex in `backend/src/middleware/auth.js` vs Joi `emailSchema` in `schemas.js` — no test proves they accept/reject the same inputs (e.g. `user@localhost`, unicode, uppercase).
- `parseInt` partial-numeric ID parsing in `backend/src/routes/workEntries.js` (`/api/work-entries/12abc` parses to `12` and succeeds).

---

## Section 5: Test Anti-Patterns

1. **Assertions buried inside `mockDb` callbacks that silently no-op.** In `reports.test.js` (Data Isolation and filter tests) and `workEntries.test.js` (clientId filter), `expect(...)` calls live inside the `mockDb.all/get` implementation. If the route never calls the mock with those arguments, the assertion never runs and the test passes.
2. **Misleadingly named describe blocks.** `CSV Export Success Path` / `PDF Export Success Path` in `reports.test.js` test only error paths.
3. **Weak assertions.** Several `schemas.test.js` cases assert only `expect(error).toBeDefined()` without checking the message or the failing key, so any validation failure (including the wrong one) passes.
4. **Tautological assertions.** `init.test.js` asserts `expect(db).toBeDefined()` on a value that is a mock return and can never be undefined.
5. **Over-mocking.** `init.test.js` mocks `sqlite3` entirely, reducing tests to matching SQL strings passed to `db.run`, without verifying schema behaviour (constraints, indexes, foreign keys).

---

## Section 6: Tests That Can Never Fail

| Test | Why it cannot fail |
|---|---|
| `init.test.js` — `expect(db).toBeDefined()` | `db` is the mocked constructor's return value; always defined. |
| `reports.test.js` — entire `CSV Export Success Path` block | Forces an error before `res.download`; asserts only error structure. Real download/cleanup code (`reports.js` 127–134) never executes. |
| `reports.test.js` — entire `PDF Export Success Path` block | Same pattern; PDF generation (`reports.js` 187–240) never executes. |
| `reports.test.js` — Data Isolation buried-callback assertion | The `expect` on the `user_email` parameter is inside the mock implementation; if the mock isn't called with that shape, nothing is asserted. |

---

## Recommendations

1. **Raise `coverageThreshold` in `backend/jest.config.js` to 80** for branches, functions, lines and statements, and add per-file thresholds (e.g. `'./src/routes/reports.js': { ... }`) so `reports.js` and `production.js` cannot hide behind the global average.
2. **Add real success-path assertions for CSV/PDF export**: use a real `PDFDocument` (or a spy that lets the code run) and assert `Content-Type`, `Content-Disposition`, body/`res.download` invocation, and temp-file cleanup; add a >5-entry and a pagination (`y > 700`) case.
3. **Hoist buried callback assertions** to explicit `expect(mockDb.all).toHaveBeenCalledWith(expect.stringContaining('user_email = ?'), expect.arrayContaining([userEmail]), expect.any(Function))` after the request completes.
4. **Add tests for uncovered flows/edge cases** listed in Sections 3–4 (bulk delete, cascade, clientId filter, cross-user mutations, `hours` 0/24, precision, string length limits, `parseInt` IDs, validator parity). Add at least one unmocked integration test of the auth middleware.
5. **Add a frontend test suite** (Vitest + React Testing Library for hooks/pages, plus Playwright E2E) and include it in the coverage gate.
6. Move the hardcoded secrets out of `backend/src/config/production.js` into environment variables and cover the config loader.

---

## Appendix A: Raw Jest Coverage Output

Run on 2026-09-22 with `cd backend && npm run test:coverage`. Full HTML report: `backend/coverage/index.html` (generated locally, gitignored; regenerate with the same command). LCOV: `backend/coverage/lcov.info`.

```
------------------|---------|----------|---------|---------|--------------------------------
File              | % Stmts | % Branch | % Funcs | % Lines | Uncovered Line #s
------------------|---------|----------|---------|---------|--------------------------------
All files         |   86.98 |    88.38 |   88.23 |   87.14 |
 config           |       0 |      100 |     100 |       0 |
  production.js   |       0 |      100 |     100 |       0 | 4
 database         |   85.71 |    71.42 |   88.88 |   85.71 |
  init.js         |   85.71 |    71.42 |   88.88 |   85.71 | 91-97,102-103
 middleware       |     100 |      100 |     100 |     100 |
  auth.js         |     100 |      100 |     100 |     100 |
  errorHandler.js |     100 |      100 |     100 |     100 |
 routes           |   86.09 |    88.41 |   87.03 |   86.29 |
  auth.js         |     100 |      100 |     100 |     100 |
  clients.js      |   88.88 |    85.71 |    87.5 |   88.88 | 96,145-146,150-151,185,191-202
  reports.js      |   64.15 |    69.44 |   68.75 |   64.42 | 127-134,187-240
  workEntries.js  |   98.41 |      100 |     100 |   98.41 | 139,256
 validation       |     100 |      100 |     100 |     100 |
  schemas.js      |     100 |      100 |     100 |     100 |
------------------|---------|----------|---------|---------|--------------------------------
Test Suites: 8 passed, 8 total
Tests:       161 passed, 161 total
Snapshots:   0 total
Time:        1.174 s
Ran all test suites.
```
