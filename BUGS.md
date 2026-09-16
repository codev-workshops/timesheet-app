# Known Bugs and Unexpected Behavior

Findings from a manual exploration of the app (login → clients → work entries → reports/exports → dashboard)
run with the machine and browser timezone set to `America/Los_Angeles` (UTC-7) at a moment when the local
date (Sep 15, 2026, ~23:10) differed from the UTC date (Sep 16, 2026, ~06:10).

Screenshots live in `docs/screenshots/`.

Severity scale: **Critical** (data corruption / wrong data persisted), **High** (wrong data shown to the
user), **Medium** (feature works but output is misleading), **Low** (cosmetic / polish).

---

## 1. Work-entry date shifts by one day in negative-UTC timezones — FIXED

**Severity:** Critical

**Steps to reproduce (before the fix)**
1. Set the OS/browser timezone to `America/Los_Angeles` and wait for a time when the local date is still
   "yesterday" relative to UTC (e.g. 23:10 PDT = 06:10 UTC next day).
2. Log in, create a client, open **Work Entries → Add Work Entry**.
3. Leave the date picker on today (09/15/2026), enter hours, click **Create**.
4. Inspect what was stored: `curl -H 'x-user-email: <you>' localhost:3001/api/work-entries`, or export the
   client's CSV/PDF from **Reports**.

**Expected:** the entry is stored as `2026-09-15` — the calendar day the user picked.

**Actual:** the entry is stored as Sep 16. The frontend built the payload with
`formData.date.toISOString().split('T')[0]`, which converts the local `Date` to UTC first, so
`2026-09-15T23:10 PDT` became `2026-09-16`. The same shift affected any picked date (Sep 10 → Sep 11,
Sep 1 → Sep 2). On the display side `new Date(entry.date).toLocaleDateString()` parsed the value as UTC
midnight and converted it *back* to local time, so the Work Entries list and Dashboard *looked* correct
(`before-work-entries-list.png`, `before-dashboard.png`) while the persisted data, the API response, the
CSV and the PDF were all one day off. Users in UTC+ zones would see the opposite: correct storage but a
display shifted one day earlier.

Compounding this, the backend `Joi.date().iso()` schema coerced the `YYYY-MM-DD` string into a JS `Date`
before insertion, so SQLite stored epoch milliseconds (`1789516800000` = `2026-09-16T00:00:00Z`) instead of
a date string. That is what showed up verbatim in the CSV/PDF exports (`before-pdf-export.png`,
`before-reports.png` for context).

**Affected files**
- `frontend/src/pages/WorkEntriesPage.tsx` — `handleSubmit` (`toISOString()`), `handleOpen` edit
  initialiser (`new Date(entry.date)`), list rendering.
- `frontend/src/pages/DashboardPage.tsx` — Recent Work Entries rendering.
- `frontend/src/pages/ReportsPage.tsx` — report table rendering; export filename used `toISOString()`.
- `backend/src/validation/schemas.js` — `Joi.date().iso()` converts the string to a `Date`.
- `backend/src/routes/reports.js` — writes the raw stored `date` into CSV/PDF (no change needed once the
  stored value is a `YYYY-MM-DD` string).

**Fix applied**
- Added `frontend/src/utils/date.ts` with `formatLocalDate(date)` (builds `YYYY-MM-DD` from local
  `getFullYear/getMonth/getDate`), `parseLocalDate(value)` (splits a `YYYY-MM-DD` string into local
  components; falls back to `new Date(value)` for timestamps/epoch values) and `formatEntryDate(value)`.
- `WorkEntriesPage`: submit with `formatLocalDate`, initialise the edit form with `parseLocalDate`, render
  with `formatEntryDate`.
- `DashboardPage` and `ReportsPage`: render entry dates with `formatEntryDate`; export filenames use
  `formatLocalDate(new Date())`.
- Backend schemas: `date` is now a `YYYY-MM-DD` string schema (pattern + real-calendar-date check) so the
  string is stored verbatim and exports print `2026-09-15` rather than epoch milliseconds. `01/15/2024`,
  `2026-02-30` and timestamps with a time component are rejected with 400.

**Verification (America/Los_Angeles, local Sep 15 / UTC Sep 16)**
- Create "today" entry → API returns `"date":"2026-09-15"`; list shows 9/15/2026
  (`after-work-entries-list.png`).
- Edit dialog opens with 09/15/2026 pre-filled; updating hours leaves the date unchanged
  (`after-edit-dialog.png`).
- Dashboard Recent Work Entries shows 9/15/2026 (`after-dashboard.png`).
- Reports table shows 9/15/2026 (`after-reports.png`).
- CSV: `2026-09-15,7,Entry dated today (Sep 15 local) - after fix,...`; PDF Date column `2026-09-15`
  (`after-pdf-export.png`). Export filenames are now `Acme_Corp_report_2026-09-15.*` instead of `…09-16`.

---

## 2. Exported CSV/PDF print the raw epoch timestamp instead of a date — FIXED (with #1)

**Severity:** High

**Steps to reproduce:** create any work entry, open **Reports**, select the client, click the CSV or PDF
export icon and open the file.

**Expected:** `Date` column shows `2026-09-15`.

**Actual:** `Date` column shows `1789516800000` (`before-pdf-export.png`; CSV row was
`1789516800000,8,Entry dated today (Sep 15 local),2026-09-16 06:13:33`).

**Affected files:** `backend/src/validation/schemas.js` (root cause — Joi coercion), `backend/src/routes/reports.js`.

**Fix:** covered by the schema change in #1; the exports now print the stored `YYYY-MM-DD` string.

---

## 3. "Created" column and PDF "Generated" stamp use server-local time with no timezone

**Severity:** Medium

**Steps to reproduce:** create an entry at 23:10 local (LA) and look at the **Created** column on Reports.

**Expected:** a created date that matches the user's local calendar day (9/15/2026), or a value with an
explicit timezone.

**Actual:** SQLite's `CURRENT_TIMESTAMP` is UTC (`2026-09-16 06:13:33`) but has no `Z` suffix, so the
frontend parses it as *local* time and shows **9/16/2026** while the user's clock still says Sep 15
(`before-reports.png`, `after-reports.png` — unchanged by the fix). The same string appears verbatim in the
CSV's `Created At` column. The PDF's `Generated:` line uses the *server* process timezone
(`new Date().toLocaleString()`), so it depends on where the backend runs, not on the user.

**Affected files:** `backend/src/database/init.js` (`created_at DATETIME DEFAULT CURRENT_TIMESTAMP`),
`frontend/src/pages/ReportsPage.tsx` (`new Date(entry.created_at)`), `frontend/src/pages/ClientsPage.tsx`
(`new Date(client.created_at)`), `backend/src/routes/reports.js`.

**Suggested fix:** return timestamps as ISO-8601 with `Z` (e.g. `strftime('%Y-%m-%dT%H:%M:%fZ','now')`) or
append `Z` before parsing on the client. Not changed in this PR (out of scope for the date-shift fix).

---

## 4. Authentication is a client-supplied header — any user can read/write any other user's data

**Severity:** High (security)

**Steps to reproduce**
```
curl localhost:3001/api/work-entries -H 'x-user-email: someone-else@example.com'
```

**Expected:** requests are authenticated with a server-issued credential.

**Actual:** the backend trusts whatever `x-user-email` header the client sends and auto-creates the user
(`backend/src/middleware/auth.js`). The "login" screen just stores the email in `localStorage`. `JWT_SECRET`
in `.env.example` is never used. User isolation in the DB is therefore only as strong as the header.

**Affected files:** `backend/src/middleware/auth.js`, `frontend/src/contexts/AuthContext.tsx`,
`frontend/src/api/client.ts`.

**Note:** this may be intentional for a workshop app; documented because it is surprising relative to the
"login" UX and the unused `JWT_SECRET`.

---

## 5. Post-create / post-update lookups in work-entries are not scoped by `user_email`

**Severity:** Low (defence-in-depth)

**Steps to reproduce:** code review only — `POST /api/work-entries` and `PUT /api/work-entries/:id` re-read
the row with `WHERE we.id = ?` (no `AND we.user_email = ?`) after writing it.

**Expected:** every query scoped by `user_email` per `AGENTS.md`.

**Actual:** the immediate re-read is by `id` only. Not exploitable today because the write itself is scoped,
but it violates the repo rule.

**Affected files:** `backend/src/routes/workEntries.js` (~lines 115–121 and the equivalent block after
`UPDATE`).

---

## 6. Hour labels are not pluralised correctly

**Severity:** Low (cosmetic)

**Steps to reproduce:** create an entry with `1` hour; view the Work Entries list and click delete.

**Expected:** "1 hour" / "…delete this 1 hour entry…" and "3.5 hours".

**Actual:** the chip always says "1 hours" (`before-delete-confirm-1-hours.png`; the confirm dialog says
"1 hour entry" so the two are inconsistent).

**Affected files:** `frontend/src/pages/WorkEntriesPage.tsx` (`label={\`${entry.hours} hours\`}`),
`frontend/src/pages/ReportsPage.tsx` (same chip).

---

## 7. Delete confirmations use the native `window.confirm`

**Severity:** Low (UX / conventions)

**Steps to reproduce:** click the trash icon on a work entry or client, or **Clear All** on Clients.

**Expected:** a Material UI `Dialog`, consistent with the rest of the app and with the frontend rule
"Material UI components only".

**Actual:** browser-native `confirm()` popup (`before-delete-confirm-1-hours.png`).

**Affected files:** `frontend/src/pages/WorkEntriesPage.tsx`, `frontend/src/pages/ClientsPage.tsx`.

---

## Not bugs (confirmed expected)

- Data disappears when the backend restarts — the SQLite database is in-memory by design.
- Login accepts any syntactically valid email with no password — by design for the workshop.
- Hours are limited to `0 < hours ≤ 24` on both client and server; values outside return a 400 with a clear
  message.
