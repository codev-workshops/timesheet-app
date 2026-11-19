# Project tag v1 — frozen contract

This is an additive change. Existing clients can omit `project`; all other
request fields, responses, and behavior stay as they are. These routes continue
to use the existing `x-user-email` header.

## Database

- `work_entries.project` is nullable SQLite `TEXT`; the default is `NULL`.
  Untagged entries, including existing rows, remain `NULL`.
- Both the backend initializer and the Docker database override must support
  fresh databases and existing tables. If the column is missing, run
  `ALTER TABLE work_entries ADD COLUMN project TEXT` before initialization
  succeeds. Re-running initialization must not duplicate the column, lose
  data, or overwrite tags. An unexpected migration error fails initialization.
- Use bound SQL parameters for values. Scope all entry and client access to
  the current user's `user_email`, including reads after POST and PUT.

## Work entries

| Request | JSON request body | Success JSON |
| --- | --- | --- |
| `POST /api/work-entries` | `{ clientId, hours, date, description?, project? }` | `201`: `{ "message": "Work entry created successfully", "workEntry": WorkEntry }` |
| `PUT /api/work-entries/:id` | One or more of `{ clientId?, hours?, date?, description?, project? }` | `200`: `{ "message": "Work entry updated successfully", "workEntry": WorkEntry }` |
| `GET /api/work-entries` | None; existing optional `?clientId=` is unchanged | `200`: `{ "workEntries": WorkEntry[] }` |
| `GET /api/work-entries/:id` | None | `200`: `{ "workEntry": WorkEntry }` |

`WorkEntry` keeps the existing `id`, `client_id`, `hours`, `description`,
`date`, `created_at`, `updated_at`, and `client_name` keys. Every entry
object includes `project` as a string or JSON `null`, never as a missing key.

- On POST, omission stores `NULL`. On PUT, omission keeps the current tag.
- On either write, `null`, `""`, or whitespace-only text stores `NULL`.
  Otherwise store the trimmed string exactly, preserving its case and internal
  whitespace. A PUT containing only `project` is valid.
- Joi: both body schemas use an optional
  `Joi.string().trim().max(50).allow(null, '')` field, with normal Joi
  conversion enabled for trimming. The limit applies after trimming, in Joi's
  string-length units (UTF-16 code units). Reject numbers, booleans, arrays,
  objects, and text over the limit. Keep the update body's minimum of one field.

## Reports

`GET /api/reports/client/:clientId`,
`GET /api/reports/export/csv/:clientId`, and
`GET /api/reports/export/pdf/:clientId` accept optional `?project=`.
For example, `?project=Client%20Launch` matches the stored tag `Client Launch`.

- Omit the parameter for an unfiltered report (including untagged entries).
  If present, validate the single decoded parameter with
  `Joi.string().trim().min(1).max(50).optional()`. An empty or whitespace-only
  value, a repeated or structured parameter, or a value over the limit is invalid.
- Match the trimmed value by exact, case-sensitive equality: no wildcard or
  substring matching. Apply it with a bound parameter in addition to client ID
  and user email. A valid filter with no matches is not an error.
- The JSON report keeps `{ client, workEntries, totalHours, entryCount }`.
  Each existing report row additionally includes `project` (string or
  `null`). Rows and totals reflect the same filtered set; no matches returns
  `workEntries: []`, `totalHours: 0`, and `entryCount: 0`.
- CSV/PDF exports use the same filtered set and keep their existing formats
  and columns, including when no rows match. The UI omits the query parameter
  when its filter is blank and applies a selected filter to downloads as well.

## Errors

| Status | Condition | JSON body |
| --- | --- | --- |
| `400` | Invalid Joi body or project query, including an empty PUT body | `{ "error": "Validation error", "details": [string, ...] }`; do not depend on Joi's exact detail text |
| `400` | Invalid existing ID input or POST/PUT client ID not owned/found | Existing error strings: `Invalid client ID`, `Invalid work entry ID`, or `Client not found or does not belong to user` |
| `400` | Malformed email header | `{ "error": "Invalid email format" }` |
| `401` | Missing email header | `{ "error": "User email required in x-user-email header" }` |
| `404` | Entry not found for the current user (GET by ID or PUT), or client not found for that user on a report/export | `{ "error": "Work entry not found" }` or `{ "error": "Client not found" }` |
| `500` | Unexpected database or server failure | Existing JSON error handling; do not expose internal SQL or database details |
