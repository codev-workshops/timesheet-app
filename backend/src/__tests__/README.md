# Backend Test Suite

Integration tests for the Express API, run against a **real in-memory SQLite database via Knex**.
No SQL mocks: every route test drives HTTP through `supertest`, then asserts status, JSON body
and the resulting rows in the database.

## Quick Start

```bash
npm test               # all tests
npm run test:coverage  # with coverage
npm run test:ci        # CI mode, enforces jest.config.js thresholds
npm test -- clients.test.js -t "deletes existing client"
```

## Structure

```
__tests__/
├── setup.js                 # mocks database/db with a fresh in-memory Knex per test file
├── helpers/
│   ├── app.js               # createApp(): routes + errorHandler like server.js; USER / OTHER_USER
│   └── db.js                # resetDatabase, insert* fixtures, failure simulators, sqlite_master queries
├── database/init.test.js    # migrations: tables, indexes, idempotency, rollback, closeDatabase
├── middleware/
│   ├── auth.test.js         # x-user-email auth + auto user creation (real DB)
│   └── errorHandler.test.js # pure unit tests
├── routes/
│   ├── auth.test.js
│   ├── clients.test.js
│   ├── workEntries.test.js
│   └── reports.test.js      # report aggregation, CSV/PDF exports
└── validation/schemas.test.js
```

## How the DB harness works

- `setup.js` calls `jest.mock(require.resolve('../database/db'), factory)`. The factory builds
  `knex({ ...require('../../knexfile'), connection: { filename: ':memory:' } })` and exposes the
  same three exports as production: `{ db, initializeDatabase, closeDatabase }`.
  Jest gives every test file its own module registry, so **each file gets its own empty DB**.
- Anything that does `const { db } = require('../database/db')` (routes, middleware, helpers,
  tests) receives that same instance.
- `afterAll` in `setup.js` calls `db.destroy()`. `console.log/error/warn` are silenced per test
  (they are `jest.spyOn` mocks, so you can `expect(console.error).toHaveBeenCalled()`).
- Do **not** use `jest.resetModules()` in DB suites: it would create a second Knex instance.

### Per-test lifecycle

```js
const request = require('supertest');
const { createApp, USER, OTHER_USER } = require('../helpers/app');
const { db, resetDatabase, insertUsers, insertClient, insertWorkEntry } = require('../helpers/db');

const app = createApp();

beforeEach(async () => {
  await resetDatabase();                 // migrate.rollback(all) + migrate.latest()
  await insertUsers(USER, OTHER_USER);   // fixtures
});

test('creates a client', async () => {
  const res = await request(app).post('/api/clients').set('x-user-email', USER).send({ name: 'Acme' });
  expect(res.status).toBe(201);
  expect(await db('clients').where({ user_email: USER })).toHaveLength(1);
});
```

### Simulating DB failures (500 paths)

No internals are mocked; the schema is broken for the current test only and `resetDatabase()`
restores it before the next one.

| Helper | Effect | Use for |
|---|---|---|
| `breakTable('clients')` | renames the table to `clients__broken` | any query on that table fails (`Internal server error`) |
| `failOn('clients', 'INSERT' \| 'UPDATE' \| 'DELETE')` | `BEFORE` trigger with `RAISE(ABORT)` | reads succeed, the write fails (`Failed to create client`, ...) |
| `ignoreInsertsOn('users')` | `BEFORE INSERT` trigger with `RAISE(IGNORE)` | insert "succeeds" but writes nothing (e.g. `/me` 404) |

Tables renamed by `breakTable` are renamed back before rollback, so migrations' `down()` can use
plain `dropTable`.

## Extending for a new table (e.g. categories, migration `002_add_categories.js`)

1. Add the migration under `src/database/migrations/`; `resetDatabase()` picks it up automatically.
2. In `database/init.test.js`, add the new table/indexes to `TABLES` / `INDEXES` and assert its
   columns/FKs with `PRAGMA table_info` / `PRAGMA foreign_key_list`.
3. Add an `insertCategory(userEmail, attrs)` fixture to `helpers/db.js` following `insertClient`.
4. Mount the new router in `helpers/app.js` exactly as in `server.js`.
5. Create `routes/categories.test.js`: CRUD happy paths, Joi 400s (`{ error: 'Validation error', details }`),
   404s, user isolation using `USER` vs `OTHER_USER`, and 500s via `breakTable` / `failOn`.
6. If `down()` of the new migration drops tables that `breakTable` might rename, nothing extra is
   needed: `resetDatabase()` restores names first.

## Coverage

`jest.config.js` enforces global thresholds: branches 60, functions 65, lines 60, statements 60.
`src/database/db.js` shows 0% because it is replaced by the mock; its behaviour is covered by
`database/init.test.js` through the identical mocked exports.
