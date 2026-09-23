# CI Fix Report — frontend PR checks & deploy workflow

GitHub Actions could not be executed locally; every result below is a local
reproduction of the exact commands the workflows run (`.github/workflows/pr-checks.yml`
`security-audit` / `test-coverage` jobs and `.github/workflows/deploy.yml`), on
Node v24.19.0 / npm 10.8.3. Raw logs are in `ci-logs/pre/` and `ci-logs/post/`.

## Summary

| Area | Command (from workflow) | Pre-fix | Post-fix |
|---|---|---|---|
| `security-audit` / `test-coverage` install | `cd frontend && npm ci` | exit 0 — a lockfile was already committed (`added 266 packages`) | exit 0 — lockfile regenerated with new devDeps (`added 348 packages`) |
| `test-coverage` | `cd frontend && npm run test:coverage` | **exit 1** — `npm error Missing script: "test:coverage"` | exit 0 — 8/8 tests pass, coverage 100% stmts/branches/funcs/lines vs 80% thresholds |
| `deploy` — build artefact | `aws s3 sync ./frontend/dist …` | **no build step**; `frontend/dist` does not exist → sync would upload nothing / fail | `npm ci && npm run build` added before sync; `frontend/dist/{index.html,assets,vite.svg}` produced (exit 0) |
| `deploy` — helper scripts | `./scripts/notify-slack.sh`, `./scripts/tag-release.sh`, `./scripts/reconcile-billing.sh` | **all 3 MISSING** → step fails with `No such file or directory` | all 3 exist, executable, `bash -n` clean; skip gracefully (exit 0) when their secret is absent |
| `deploy` — credentials | env literals in YAML | 5 hardcoded secrets (AWS key pair, Slack bot token, GitHub PAT, Stripe live key) | 0 literals; 5 `${{ secrets.* }}` references |

Note on fix #1: the task assumed `frontend/package-lock.json` was missing. It was
already tracked on `main` and `npm ci` passed pre-fix. The lockfile has been updated
(via `npm install`) so it stays consistent with the new `package.json` devDependencies;
`npm ci` continues to pass.

## 1. `npm ci` (frontend)

<table><tr><th>Pre-fix (`ci-logs/pre/npm-ci.log`)</th><th>Post-fix (`ci-logs/post/npm-ci.log`)</th></tr>
<tr><td>

```
added 266 packages, and audited 267 packages in 6s
...
exit=0
```

</td><td>

```
added 348 packages, and audited 349 packages in 7s
...
exit=0
```

</td></tr></table>

## 2. `npm run test:coverage` (frontend)

<table><tr><th>Pre-fix (`ci-logs/pre/test-coverage.log`)</th><th>Post-fix (`ci-logs/post/test-coverage.log`)</th></tr>
<tr><td>

```
npm error Missing script: "test:coverage"
npm error
npm error To see a list of scripts, run:
npm error   npm run
exit=1
```

</td><td>

```
 Test Files  1 passed (1)
      Tests  8 passed (8)

=========== Coverage summary ===========
Statements   : 100% ( 14/14 )
Branches     : 100% ( 2/2 )
Functions    : 100% ( 5/5 )
Lines        : 100% ( 14/14 )
========================================
exit=0
```

</td></tr></table>

What changed:

- devDependencies: `vitest`, `@vitest/coverage-v8`, `@testing-library/react`,
  `@testing-library/jest-dom`, `jsdom`.
- `package.json` scripts: `test` (`vitest run`), `test:coverage` (`vitest run --coverage`).
- `vite.config.ts`: vitest `test` block — `environment: 'jsdom'`, `coverage.provider: 'v8'`,
  `coverage.include: src/components/**` (the scope named in the workflow's PR comment),
  thresholds 80/80/80/80. React plugin and `/api` dev proxy unchanged.
- `src/test/setup.ts` registers jest-dom matchers.
- `src/components/__tests__/Layout.test.tsx` — 8 tests covering nav rendering, route
  title lookup + fallback, user email/avatar, no-user case, navigation, logout, and
  mobile drawer toggle. No source components were modified; thresholds not lowered.
- `eslint.config.js` / `.gitignore`: ignore the generated `coverage/` directory.

## 3. `deploy.yml`

<table><tr><th>Pre-fix (`ci-logs/pre/deploy-validation.log`)</th><th>Post-fix (`ci-logs/post/deploy-validation.log`)</th></tr>
<tr><td>

```
== deploy.yml referenced scripts ==
MISSING scripts/notify-slack.sh
MISSING scripts/tag-release.sh
MISSING scripts/reconcile-billing.sh
== build step present? ==
0
== frontend/dist exists? ==
ls: cannot access 'frontend/dist': No such file or directory
== hardcoded secrets in deploy.yml ==
5 literal credential values (lines 15,16,23,29,35)
```

</td><td>

```
== deploy.yml referenced scripts ==
OK scripts/notify-slack.sh
OK scripts/tag-release.sh
OK scripts/reconcile-billing.sh
== build step present? ==
1
== build (npm ci && npm run build in frontend) ==
✓ built in 7.32s
exit=0
== frontend/dist exists? ==
assets  index.html  vite.svg
== hardcoded secrets in deploy.yml ==
0 literals; secrets.* refs: 5
== scripts run with no secrets (skip path) ==
SLACK_BOT_TOKEN not set; skipping ...   exit=0
GITHUB_PAT not set; skipping ...        exit=0
STRIPE_SECRET_KEY not set; skipping ... exit=0
bash -n: all scripts parse
deploy.yml: valid YAML
```

</td></tr></table>

What changed:

- Added `actions/setup-node@v4` (Node 20, npm cache) + `npm ci` + `npm run build` in
  `frontend/` before the S3 sync.
- Created `scripts/notify-slack.sh`, `scripts/tag-release.sh`,
  `scripts/reconcile-billing.sh` (executable). Each exits 0 with a message when its
  secret is not configured, so the workflow no longer fails on a missing file and the
  optional steps can be enabled by simply adding the repository secrets. `reconcile-billing.sh`
  additionally requires `BILLING_WEBHOOK_URL` since no endpoint was defined anywhere.
  **Intent of these three steps should still be confirmed by the repo owners** — if they
  are not needed, delete the steps and scripts.
- Replaced all inline credentials with `${{ secrets.AWS_ACCESS_KEY_ID }}`,
  `${{ secrets.AWS_SECRET_ACCESS_KEY }}`, `${{ secrets.SLACK_BOT_TOKEN }}`,
  `${{ secrets.GITHUB_PAT }}`, `${{ secrets.STRIPE_SECRET_KEY }}`.

## Required follow-up: rotate exposed credentials

The previously committed values (AWS access key `AKIA5J7K…`, an `xoxb-` Slack bot token, a
`ghp_` GitHub PAT and an `sk_live_` Stripe key) remain in git history and must be
treated as compromised. Revoke/rotate each at its provider, then add the new values
as GitHub Actions repository secrets under the names above.
