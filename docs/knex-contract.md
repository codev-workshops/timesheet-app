# Knex migration — frozen interface contract

Owner: orchestrator. Children MUST NOT edit this file. Changes require orchestrator sign-off.

Integration branch: `devin/knex-v2-integration` (all child PRs target it, not `main`).

## 1. `backend/knexfile.js`
Exports a single flat Knex config object (not env-keyed):

```js
const path = require('path');
module.exports = {
  client: 'sqlite3',
  connection: { filename: process.env.DATABASE_PATH || ':memory:' }, // Docker sets DATABASE_PATH
  useNullAsDefault: true,
  pool: { min: 1, max: 1 },          // :memory: is per-connection; must be exactly one
  migrations: { directory: path.join(__dirname, 'src', 'database', 'migrations') }
};
```

## 2. `backend/src/database/db.js`
```js
const knex = require('knex');
const config = require('../../knexfile');
const db = knex(config);
async function initializeDatabase() { await db.migrate.latest(); }
async function closeDatabase() { await db.destroy(); }
module.exports = { db, initializeDatabase, closeDatabase };
```
- Exactly these three exports. No `getDatabase`.
- `backend/src/database/init.js` is DELETED. Nothing may import it.
- Consumers import with `const { db } = require('../database/db');` and call `db('table')...` / `db.raw(...)` at request time.
- Do NOT enable `PRAGMA foreign_keys` (current app does not; preserve behavior).

## 3. Migrations (`backend/src/database/migrations/`)
- `001_initial_schema.js` exports `up(knex)` AND `down(knex)` (down drops `work_entries`, `clients`, `users` in that order).
- `up` recreates exactly the current `init.js` schema:
  - `users(email TEXT PK, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`
  - `clients(id INTEGER PK AUTOINCREMENT, name TEXT NOT NULL, description TEXT, department TEXT, email TEXT, user_email TEXT NOT NULL FK->users.email ON DELETE CASCADE, created_at, updated_at DEFAULT CURRENT_TIMESTAMP)`
  - `work_entries(id INTEGER PK AUTOINCREMENT, client_id INTEGER NOT NULL FK->clients.id ON DELETE CASCADE, user_email TEXT NOT NULL FK->users.email ON DELETE CASCADE, hours DECIMAL(5,2) NOT NULL, description TEXT, date DATE NOT NULL, created_at, updated_at DEFAULT CURRENT_TIMESTAMP)`
  - Indexes (exact names): `idx_clients_user_email`, `idx_work_entries_client_id`, `idx_work_entries_user_email`, `idx_work_entries_date`.
- Future migrations are numbered `NNN_snake_case.js` (`002_add_categories.js` is reserved for session C).

## 4. Behavior preserved
- HTTP routes, status codes, JSON envelope keys (`{ clients }`, `{ client }`, `{ workEntries }`, `{ workEntry }`, `{ error }`, `{ message }` …) and error messages are unchanged from `main`.
- DB errors in routes/middleware: `console.error(...)` + `500 { error: 'Internal server error' }` (or the existing specific message where one exists today).
- All queries scoped by `user_email` and parameterized (Knex builder or `db.raw(sql, bindings)`); no string interpolation.

## 5. Test harness (owned by `backend/src/__tests__/`)
- `setup.js` mocks `database/db.js` with a module exposing the same three exports backed by a fresh in-memory Knex instance built from `backend/knexfile.js`.
- Schema reset per test via `db.migrate.rollback(undefined, true)` + `db.migrate.latest()` (or truncation), then fixture inserts; `db.destroy()` in `afterAll`.
- Tests rely only on the exports above and on HTTP behavior — not on route internals.

## 6. File ownership / merge order
| Session | Owns | Merge order |
|---|---|---|
| A (Knex integration) | `backend/package.json`, `backend/package-lock.json`, `backend/knexfile.js`, `backend/src/database/**`, `backend/src/routes/*.js`, `backend/src/middleware/*`, `backend/src/server.js` | 1st |
| B (tests) | `backend/src/__tests__/**` only | 2nd (rebase on A) |
| Orchestrator | `docs/knex-contract.md`, reconciliation fixes after A+B | 3rd |
| C (categories V2) | starts from integration branch after green `npm run test:ci` | 4th |
