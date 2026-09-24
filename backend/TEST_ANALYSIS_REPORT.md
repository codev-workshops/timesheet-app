# Backend Test Analysis Report

Scope: `backend/` only. All numbers come from `cd backend && npm run test:coverage`
(Jest 29, `collectCoverageFrom: src/**/*.js` excluding `src/server.js`). The real run is
authoritative; the figures quoted in `README.md` (overall ~90%) and
`src/__tests__/README.md` (overall ~79%) were both stale and are superseded by the
tables below.

## Coverage Before and After (module-wise breakdown)

### BEFORE (baseline on `main`, 161 tests / 8 suites)

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered lines |
|------|--------:|--------:|--------:|--------:|-----------------|
| **All files** | **86.98** | **88.38** | **88.23** | **87.14** | |
| config/production.js | 0 | 100 | 100 | 0 | 4 |
| database/init.js | 85.71 | 71.42 | 88.88 | 85.71 | 91-97, 102-103 |
| middleware/auth.js | 100 | 100 | 100 | 100 | |
| middleware/errorHandler.js | 100 | 100 | 100 | 100 | |
| routes/auth.js | 100 | 100 | 100 | 100 | |
| routes/clients.js | 88.88 | 85.71 | 87.5 | 88.88 | 96, 145-146, 150-151, 185, 191-202 |
| routes/reports.js | 64.15 | 69.44 | 68.75 | 64.42 | 127-134, 187-240 |
| routes/workEntries.js | 98.41 | 100 | 100 | 98.41 | 139, 256 |
| validation/schemas.js | 100 | 100 | 100 | 100 | |

Gate at baseline: `coverageThreshold.global = { branches: 60, functions: 65, lines: 60, statements: 60 }`.

Root cause of the low `reports.js` number: every CSV test mocked `writeRecords` with
`mockRejectedValue`, so only the `.catch` branch ran, and both PDF tests only exercised DB
errors, so the whole PDFDocument-building block (lines 187-240) was dead in coverage.

### AFTER (169 tests / 8 suites)

| File | % Stmts | % Branch | % Funcs | % Lines | Uncovered lines |
|------|--------:|--------:|--------:|--------:|-----------------|
| **All files** | **96.74** | **95.45** | **97.05** | **96.73** | |
| config/production.js | 0 | 100 | 100 | 0 | 4 |
| database/init.js | 100 | 92.85 | 100 | 100 | 92 (branch only) |
| middleware/auth.js | 100 | 100 | 100 | 100 | |
| middleware/errorHandler.js | 100 | 100 | 100 | 100 | |
| routes/auth.js | 100 | 100 | 100 | 100 | |
| routes/clients.js | 88.88 | 85.71 | 87.5 | 88.88 | 96, 145-146, 150-151, 185, 191-202 |
| routes/reports.js | 100 | 100 | 100 | 100 | |
| routes/workEntries.js | 98.41 | 100 | 100 | 98.41 | 139, 256 |
| validation/schemas.js | 100 | 100 | 100 | 100 | |

Delta: statements +9.76, branches +7.07, functions +8.82, lines +9.59.

Gate after: `coverageThreshold.global = { branches: 80, functions: 80, lines: 80, statements: 80 }`
in `jest.config.js`; `npm run test:coverage` exits 0.

### Tests added

`src/__tests__/routes/reports.test.js` (+6 tests):

- CSV download flow (`writeRecords` resolves; `res.download` replaced by a stub via a small
  wrapper app because `fs` is auto-mocked and Express's real `sendFile` would never
  complete):
  - happy path — records written, `res.download` called with sanitised filename, `fs.unlink` called, no `console.error`
  - `res.download` callback receives an error — `Error sending file:` logged, temp file still unlinked
  - `fs.unlink` callback receives an error — `Error deleting temp file:` logged
- PDF generation (mocked `PDFDocument` returned via `mockImplementationOnce`):
  - 6 entries with `doc.y = 100` — header/totals text, `'No description'` fallback, one separator after entry 5, `doc.end` called, `Content-Type`/`Content-Disposition` headers asserted
  - 3 entries with `doc.y = 750` — `addPage` called per entry (covers the `y > 700` branch)
  - 0 entries — `Total Hours: 0.00`, `Total Entries: 0`

`src/__tests__/database/init.test.js` (+2 tests), added to lift `database/` branch coverage
above 80%:

- `closeDatabase()` on a fresh module with no connection resolves immediately (`!db` branch)
- two concurrent `closeDatabase()` calls while `db.close` is pending — only one `close`, both
  promises resolve after the close completes (`isClosing` polling branch)

## Anti-Patterns

Observed in `backend/src/__tests__/` (169 tests):

1. **Error-path-only "success path" suites** — the pre-existing `CSV Export Success Path` and
   `PDF Export Success Path` describe blocks contained only failure cases. Names should match
   behaviour; the new download/generation tests now fill the gap.
2. **Shared mutable mock state across tests** — `reports.test.js` calls
   `createObjectCsvWriter.mockReturnValue(...)` per test with no reset; `afterEach` uses
   `jest.clearAllMocks()` which clears calls but not implementations, so ordering-dependent
   leakage is possible. Same pattern in `init.test.js`, where a `jest.doMock('sqlite3', ...)`
   in one test leaks into later tests that `require` the module again (this bit us while adding
   the new `closeDatabase` test; the new test re-mocks `sqlite3` locally to be self-contained).
3. **Assertions inside mock callbacks** — 5 places use `expect(params)…` inside a
   `mockDb.*.mockImplementation` callback. If the route never reaches that query the assertion
   silently never runs; assertions should live after the request with `toHaveBeenCalledWith`.
4. **Weak assertions** — 16 bare `toHaveBeenCalled()` checks with no argument matching.
5. **`done` + `setImmediate` timing** — 4 tests in `middleware/auth.test.js` rely on
   `setImmediate` to wait for the callback-based auth flow instead of awaiting a promise or
   using `supertest`. See the flaky-test report below; currently stable but fragile if the
   middleware ever becomes multi-tick async.
6. **Uncovered `config/production.js`** (0% statements) — a one-line config module that is
   never imported by tests. Low value, but it makes the `config` row misleading in reports.
7. **Stale documentation** — `README.md` and `src/__tests__/README.md` disagree with each
   other and with the real run (see header). Coverage numbers in docs should be generated,
   not hand-maintained.

## Flaky Test Report

Candidates: the 5 tests in `src/__tests__/middleware/auth.test.js` that depend on
asynchronous callback timing (`should accept valid email format`, and the four
`done`/`setImmediate` tests: `should authenticate existing user and call next()`,
`should handle database error when checking user`,
`should create new user if not exists and call next()`,
`should handle error when creating new user`).

Procedure: `npx jest src/__tests__/middleware/auth.test.js -t "<names>"` executed 5 times in
sequence; additionally the full suite (`npx jest`) was executed 3 times.

| Run | Candidate tests | Result |
|-----|-----------------|--------|
| 1 | 5 | 5 passed |
| 2 | 5 | 5 passed |
| 3 | 5 | 5 passed |
| 4 | 5 | 5 passed |
| 5 | 5 | 5 passed |

Full suite: 3/3 runs, 169/169 passed each time.

Verdict: no flakiness reproduced (0 failures in 25 candidate executions). The
`setImmediate` pattern remains a latent risk (see Anti-Patterns #5) but is not currently
producing non-deterministic results because the mocked `sqlite3` callbacks are synchronous.

## Final Package-Level Coverage

Overall (package-level) from the AFTER run:

| Metric | Coverage | ≥80%? |
|--------|---------:|:-----:|
| Statements | 96.74% | yes |
| Branches | 95.45% | yes |
| Functions | 97.05% | yes |
| Lines | 96.73% | yes |

Per-directory (package) rollup, as reported by Istanbul's directory rows:

| Package | % Stmts | % Branch | % Funcs | % Lines | All ≥80%? |
|---------|--------:|--------:|--------:|--------:|:---------:|
| database/ | 100 | 92.85 | 100 | 100 | yes |
| middleware/ | 100 | 100 | 100 | 100 | yes |
| routes/ | 96.25 | 95.12 | 96.29 | 96.23 | yes |
| validation/ | 100 | 100 | 100 | 100 | yes |

All four packages and all four global metrics are at or above 80%, and the
`coverageThreshold.global` gate in `jest.config.js` is now set to 80/80/80/80 and passes.

Note: `config/production.js` (0% statements, single line, not imported by any test) is
excluded from the rollup above because it is not one of the four requested packages; it
does not affect the global gate result.
