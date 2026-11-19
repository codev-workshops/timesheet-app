# Contract: `project` field on work entries (v1, frozen)

Additive change. Clients that never send `project` keep working unchanged.
Types: `frontend/src/types/api.ts` is the TypeScript form of this document.
Changing anything here requires a new contract revision, not an edit in a
feature branch.

## Common rules

- Auth: every route below uses `authenticateUser` (`x-user-email` header) and
  every query is parameterized and scoped by `user_email = ?`.
- Error envelope: every non-2xx response is JSON `{ "error": string }`.
  Body-validation failures may add `details: string[]`
  (`{ "error": "Validation error", "details": [...] }`); clients must rely
  only on `error`, never on Joi's detail text.
- `date` is an ISO 8601 string (`YYYY-MM-DD` or full ISO timestamp). It is
  validated as ISO but **stored verbatim** — exactly the string the client
  sent — and returned unchanged as a string. No `Date` conversion, no
  numeric timestamps, no timezone shifting.

## Database

- `work_entries.project TEXT` — nullable, default `NULL`. Existing rows stay
  `NULL`.
- Fresh databases get `project` from `CREATE TABLE`. Existing tables are
  migrated idempotently: `PRAGMA table_info(work_entries)`, then
  `ALTER TABLE work_entries ADD COLUMN project TEXT` only if the column is
  missing. Re-running init never fails, duplicates the column, or loses data.
- Applied identically in `backend/src/database/init.js` and
  `docker/overrides/database/init.js`.

## `project` value rules (request bodies)

- Joi (both `workEntrySchema` and `updateWorkEntrySchema`):
  `project: Joi.string().trim().max(200).optional().allow('')`.
- Type is string only. `null`, numbers, booleans, arrays, objects → `400`.
  Longer than 200 characters after trimming → `400`.
- Stored value is the trimmed string, case preserved. `""` (or whitespace
  only) is stored as `NULL`.
- POST: omitted → `NULL`. PUT: omitted → unchanged; `""` → cleared to `NULL`.
  A PUT body containing only `project` is valid (update body still needs at
  least one field).

## WorkEntry response object

```ts
interface WorkEntry {
  id: number;
  client_id: number;
  hours: number;
  description: string | null;
  date: string;            // verbatim ISO string, see Common rules
  project: string | null;  // key always present
  created_at: string;
  updated_at: string;
  client_name?: string;    // present on all /api/work-entries responses
}
```

## Endpoints

| Request | Body / query | Success |
| --- | --- | --- |
| `POST /api/work-entries` | `{ clientId, hours, date, description?, project? }` | `201` `{ "message": "Work entry created successfully", "workEntry": WorkEntry }` |
| `PUT /api/work-entries/:id` | any non-empty subset of `{ clientId, hours, date, description, project }` | `200` `{ "message": "Work entry updated successfully", "workEntry": WorkEntry }` |
| `GET /api/work-entries` | `?clientId=` (unchanged), `?project=` (new) | `200` `{ "workEntries": WorkEntry[] }` |
| `GET /api/work-entries/:id` | — | `200` `{ "workEntry": WorkEntry }` |
| `GET /api/reports/client/:clientId` | `?project=` (new) | `200` `ClientReport` |

### `?project=` filter (both GET routes above)

- Absent, or blank after trimming → no filter (all entries, tagged and
  untagged).
- Otherwise match `project = ?` with the trimmed value: exact,
  case-sensitive equality, no wildcards/substring. Combined with the existing
  `user_email` (and `clientId`) conditions.
- Repeated/array parameter, or longer than 200 characters after trimming →
  `400` `{ "error": "Invalid project filter" }`.
- A valid filter with no matches is `200` with an empty list (report:
  `workEntries: []`, `totalHours: 0`, `entryCount: 0`).

### ClientReport

```ts
interface ClientReport {
  client: { id: number; name: string };
  workEntries: Array<{
    id: number; hours: number; description: string | null; date: string;
    project: string | null; created_at: string; updated_at: string;
  }>;
  totalHours: number;  // sum over the filtered workEntries
  entryCount: number;  // workEntries.length
}
```

CSV/PDF exports (`/api/reports/export/{csv,pdf}/:clientId`) are unchanged in
v1: same columns, and they ignore `?project=`.

## Errors

| Status | Condition | Body |
| --- | --- | --- |
| `400` | Invalid body (including bad `project`, empty PUT body) | `{ "error": "Validation error", "details": string[] }` |
| `400` | Invalid `?project=` | `{ "error": "Invalid project filter" }` |
| `400` | Bad IDs / foreign client | Existing strings: `Invalid client ID`, `Invalid work entry ID`, `Client not found or does not belong to user` |
| `400` / `401` | Malformed / missing `x-user-email` | `{ "error": "Invalid email format" }` / `{ "error": "User email required in x-user-email header" }` |
| `404` | Entry or client not owned by the current user | `{ "error": "Work entry not found" }` / `{ "error": "Client not found" }` |
| `500` | Unexpected failure | `{ "error": string }` with no SQL/DB internals |
