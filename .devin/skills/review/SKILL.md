---
name: review
description: Review timesheet-app changes before committing
allowed-tools: [read, grep, glob, exec]
---

Review the current git diff against the checklist in `REVIEW.md` (the same rules Devin Review applies to every PR):

1. Read `REVIEW.md`, then run `git diff` (and `git diff --staged` if there are staged changes).
2. Check backend changes against the "Backend" sections of `REVIEW.md`: parameterized SQL with `user_email` scoping, `authenticateUser` on routes, Joi validation on new inputs (`backend/src/validation/schemas.js`), the `{ error: ... }` / `{ workEntries: ... }` response envelope conventions, async error propagation, middleware order, and parity between `backend/src/server.js` and `docker/overrides/server.js`.
3. Check frontend changes against the "Frontend" section of `REVIEW.md`: MUI components, TanStack Query for server state, strict TypeScript (no `any`), keyboard and screen-reader accessibility.
4. Verify changed backend behavior is covered in `backend/src/__tests__/`; run `cd backend && npm test` and report failures. For frontend changes run `cd frontend && npm run lint && npm run build`.
5. Report using the "Summary format" in `REVIEW.md`: findings as `severity — file:line — issue — suggested fix`, then an overall verdict.
