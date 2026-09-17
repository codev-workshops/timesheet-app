# Review guidelines for timesheet-app

Devin Review ingests this file on every pull request. Human reviewers and the `/review` skill follow the same checklist. Authoring conventions live in `AGENTS.md` and `.devin/rules/`; this file describes what a review must check and how to report it.

## How to review

- Priority order: correctness, security and user isolation, error handling, performance, tests, style.
- Verify the current PR head before commenting. Do not re-raise a resolved thread unless the fix is incomplete or regressed.
- Comment only on concrete, actionable findings. Cite `file:line`; use a GitHub suggestion block when a direct code change applies.
- Issues outside the diff are listed as pre-existing in the summary and do not block the PR.
- Severity scale:
  - `blocker`: SQL injection, missing `user_email` scoping, missing authentication, secrets in code or logs, a crash or hang on the request path.
  - `high`: incorrect behaviour on a main path, unhandled async error, fail-open operational endpoint in production, divergence between the two server entry points.
  - `medium`: missing validation, missing tests for changed behaviour, sensitive data in logs, N+1 or unindexed query.
  - `low` / `nit`: style, naming, duplication, docs.
- Recommendation: request changes for any `blocker` or `high`; otherwise comment.

## Backend: data access and security

- Every SQL statement uses `?` placeholders. Flag any template literal or string concatenation that builds SQL.
- Every `SELECT`, `UPDATE` and `DELETE` on user-owned tables (`clients`, `work_entries`) includes `AND user_email = ?`. A re-read by `id` is acceptable only when the id came from `this.lastID` of a user-scoped insert.
- Every route file except `backend/src/routes/auth.js` applies `authenticateUser` (router-level `router.use(authenticateUser)` or per route).
- Request bodies are validated with the Joi schemas in `backend/src/validation/schemas.js`; validation failures return `400` with `{ error: ... }`.
- New headers, query and path parameters have explicit validation with a pattern and a maximum length before use (for example `X-Request-Id` must match `^[A-Za-z0-9._:-]{1,128}$`).
- Operational endpoints (`/metrics`, and any future `/debug` or `/admin`) are not fail-open in production: when `NODE_ENV=production` and the protecting token is unset, the endpoint must fail closed or the server must log a startup warning.
- Secret and token comparisons use `crypto.timingSafeEqual` after a length check.
- Logs, traces and metrics never contain: `Authorization` or `x-user-email` header values, request bodies, tokens, passwords, or the raw query string (`req.originalUrl` must be reduced to `req.path` or to an allow-listed set of parameters).
- All logging in `backend/src` goes through the Winston logger (`backend/src/config/logger.js`); no `console.*`.
- CORS options and `credentials: true` must be identical in `backend/src/server.js` and `docker/overrides/server.js`.

## Backend: error handling

- `async` route handlers and middleware wrap their body in `try/catch` and call `next(err)`; Express 4 does not observe rejected promises.
- Unexpected errors reach `backend/src/middleware/errorHandler.js`. Clients receive a generic `{ error: ... }` message; stack traces and internal `err.message` values are logged server-side only.
- Optional infrastructure (tracing SDK, metric exporters, external collectors) degrades gracefully: initialisation is wrapped in `try/catch`, failure is logged, and the request pipeline is unaffected.
- `process.exit` and signal handlers belong in the entry point (`server.js`) only. Library and config modules export a `shutdown()` function instead.
- Response-completion hooks listen to both `finish` and `close` and run exactly once so aborted requests are recorded.

## Backend: middleware order and observability

- Required order in both entry points: `helmet` → `cors` → `requestContext` → `metricsMiddleware` → `requestLogger` → `rateLimit` → body parsers → routes → `errorHandler`. Anything that can short-circuit a request (rate limiter, body parser, auth) runs after correlation and logging.
- `/health` and `/metrics` are exempt from the rate limiter. The exemption must match how the route is registered (method, trailing slash).
- Prometheus labels are bounded: route template (or `unmatched`), method, status. Never raw paths, ids, emails or request ids.
- Changes to `backend/src/server.js` and `docker/overrides/server.js`, or to `backend/src/database/init.js` and `docker/overrides/database/init.js`, must be applied to both files. Prefer extracting shared setup over copy-paste. Divergence is `high`.

## Backend: performance

- Report and aggregation queries (`backend/src/routes/reports.js`) filter on indexed columns (`user_email`, `client_id`, `date`). Flag new full-table scans and `db.get`/`db.all` calls inside loops or per-row callbacks (N+1).
- New indexes are added in both `database/init.js` files.
- Per-request middleware does not duplicate work: one timing sample and one pair of completion listeners per request; no synchronous I/O on the request path.

## Backend: tests

- Coverage gate: `cd backend && npm run test:ci` passes the thresholds in `backend/jest.config.js`, and overall statement coverage stays at or above 80%. Call out any new module below roughly 70%.
- Every changed behaviour has a test in `backend/src/__tests__/`, including negative paths: rejected inputs, `401`/`403`/`404`, aborted requests, rate-limiter exemptions, once-only guards, and environment toggles (variable set vs unset, production vs non-production).
- Tests do not depend on execution order or on shared global registries; use `>=` assertions or reset singletons between tests.
- Tests that mutate `process.env` restore it in `afterEach`.

## Frontend

- Material UI components only; server state goes through TanStack Query hooks in `frontend/src/hooks` and `frontend/src/api`. No raw `axios` calls in components or pages.
- Strict TypeScript: no `any`, no non-null assertions without a comment explaining why.
- Accessibility:
  - Interactive elements are real controls (`<button>`, `<a>`, MUI `Button`/`IconButton`/`Link`), never a clickable `div` or `span`.
  - Every action is reachable with Tab and operable with Enter or Space; focus is visible.
  - Icon-only buttons have `aria-label`; form fields have a visible `label` or `aria-labelledby`.
  - Dialogs use MUI `Dialog` (focus trap, Escape to close, focus returns to the trigger).
  - Status is not conveyed by colour alone; images and decorative icons have `alt` text or `aria-hidden`.
  - Loading, empty and error states are rendered as text, not only as spinners or colour changes.
- `cd frontend && npm run lint` and `cd frontend && npm run build` pass. No `eslint-disable` without a justification comment.

## Pull request hygiene

- One concern per PR. Flag (but do not block) diffs over ~300 changed lines excluding lockfiles.
- Runtime dependencies are in `dependencies`, not `devDependencies` (the Docker image installs with `--only=production`). Use pinned ranges and versions published at least 7 days ago.
- New environment variables and endpoints are documented in `backend/DEPLOYMENT.md` or `README.md`, including their production security defaults.
- Commit messages and PR titles use conventional-commit prefixes (`feat`, `fix`, `docs`, `refactor`, `test`, `chore`).

## Summary format

1. Highest-severity findings first, each as `severity — file:line — issue — suggested fix`.
2. Previously raised threads confirmed resolved at the current head.
3. Remaining gaps grouped by category (security, error handling, performance, tests, style).
4. Pre-existing issues outside the diff (non-blocking).
5. Recommendation: approve, comment, or request changes. If there are no actionable findings, say so and list what was verified.
