# Lab B1: Work entries move to the previous day

## Reproduction

1. Run `npm run dev` in both `backend` and `frontend`. Open the app at `http://localhost:5173`.
2. In a browser set to `America/Los_Angeles`, sign in, add a client, and save two work entries dated January 1, 2024 and February 29, 2024.
3. Open **Reports** and select that client. Before the fix, the dates were December 31, 2023 and February 28, 2024. The CSV showed `1704067200000` and `1709164800000` rather than calendar dates. As a control, the same stored values displayed on the expected days in UTC.

These are billing dates, not timestamps. An entry appearing in the previous month or year can be assigned to the wrong billing period.

## Root cause

The work-entry create and update validators used `Joi.date().iso()`, which converted the date-only input to a JavaScript `Date` at UTC midnight. The routes bound that object directly to SQLite, which stored epoch milliseconds. The report and export queries returned that value unchanged. The UI turned it back into an instant and displayed it in local time, putting UTC midnight on the previous calendar day west of UTC. Separately, the form saved a local date by converting it to UTC with `toISOString()`; selecting local midnight in Tokyo could therefore send the previous day before the request even reached the API.

## Fix and regression coverage

Create and update still validate ISO date input, but pass a `YYYY-MM-DD` string to SQLite. This keeps the API and both report exports on the same date-only representation, and the strings retain chronological sort order. The database is in memory and recreated when the server restarts, so no stored-data migration is needed.

The date picker sends the selected local calendar day, and the edit form, Work Entries list, Dashboard, and Reports parse date-only values as local dates. Empty or invalid picker values are not submitted. Existing route tests now check that both inserts and updates bind a calendar-date string instead of a JavaScript `Date`.

## Other exploratory checks

Blank client names and blank hours were rejected. A client and a work entry containing quotes, commas, and non-ASCII text were saved successfully; CSV quoted the description containing a comma. Parallel work-entry creates both appeared in the report and totaled 3.75 hours. Eight concurrent downloads of the same CSV returned HTTP 200 and equal byte counts. The PDF endpoint returned a PDF. Joi rejected a login on the reserved `.test` domain, so the reproduction used an `example.com` address.
