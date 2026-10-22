# Mutation Testing (Stryker)

Stryker mutates `src/routes/**`, `src/validation/**` and `src/middleware/auth.js` and re-runs
the Jest suite against each mutant. Config: `stryker.conf.json` (reuses `jest.config.js`, so the
global `sqlite3` mock in `src/__tests__/setup.js` loads in every Stryker worker; guarded by
`src/__tests__/database/sqliteMock.test.js`).

```bash
cd backend
npm run test:mutation          # = stryker run, ~4 min
# reports: reports/mutation/mutation.html, reports/mutation/mutation.json (gitignored)
```

## Results

| File | Before | After |
|---|---|---|
| **All files** | **62.35%** | **99.08%** |
| middleware/auth.js | 90.00% | 100.00% |
| routes/auth.js | 87.27% | 100.00% |
| routes/clients.js | 56.72% | 98.51% |
| routes/reports.js | 48.70% | 100.00% |
| routes/workEntries.js | 68.58% | 99.12% |
| validation/schemas.js | 52.50% | 95.00% |

| Mutants (766 total) | Before | After |
|---|---|---|
| Killed | 308 | 577 |
| Timeout (counted as detected) | 169 | 181 |
| Survived | 192 | 7 |
| No coverage | 96 | 0 |
| Runtime error (detected) | 1 | 1 |
| Jest tests | 140 | 307 |

## Remaining survivors (equivalent mutants)

- `router.get('/')` / `router.post('/')` / `router.delete('/')` → `''` in `clients.js` and
  `workEntries.js` (5): Express 4 routers match `''` and `'/'` identically for a mounted router.
- `Joi.string().trim().min(1)` → `.max(1)` for `name` in `clientSchema` / `updateClientSchema` (2):
  the following `.max(255)` replaces the mutated `max(1)` rule, and Joi strings already reject
  `''` (including whitespace-only after `trim()`), so `min(1)` is redundant.

`email().max(255)` is also never the binding limit because Joi's `email()` caps addresses at 254
characters.

## What the new tests cover

- `reports.js`: invalid `clientId` guard on every endpoint, exact SQL/params, CSV writer
  arguments, `res.download` success + `fs.unlink` cleanup (and their error logging), PDF content,
  `doc.y > 700` page break (and `=== 700` no-break), separator after every 5th entry, DB errors.
- `workEntries.js`: optional GET `clientId` (absent / empty / numeric / invalid), PUT ownership
  check for a valid vs foreign `clientId`, one partial update per field (`hours`, `description`,
  `date`), dynamic SQL/params, DB errors and `next(err)` forwarding.
- `clients.js`: one partial update per field (`name`, `description`, `department`, `email`),
  empty optional values → `null`, dynamic SQL/params, bulk/individual delete, DB errors.
- `middleware/auth.js`: missing/empty header 401, malformed emails 400 without touching the DB,
  existing-user lookup.
- `validation/schemas.js`: `hours` 0 / 0.01 / 24 / 24.01 and 2-dp rounding, string trim,
  max-length and empty-string rules.
- `src/__tests__/helpers/sequentialDb.js`: DB mock that records `[method, query, params]` and
  fails the Nth call, used for the error-path tests.
