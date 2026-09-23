# SAST Auto-Remediation

Workflow: `.github/workflows/sast-auto-remediate.yml` (`SAST Auto-Remediate`).

The pipeline scans the repository for CRITICAL/HIGH dependency and container
vulnerabilities, dispatches one Devin session per finding, has Devin commit the
fix to the **same branch**, and re-scans to verify. Two circuit breakers stop it
from looping or retrying forever.

## Flow

```
push(main) / nightly cron / workflow_dispatch
  -> provenance guard (skip bot / Devin commits)
  -> scan: npm audit --json (backend, frontend) + Trivy image scan
  -> normalize + fingerprint CRITICAL/HIGH findings
  -> gate: attempt counter (max 2 per fingerprint)
  -> POST Devin API, one session per finding
  -> Devin pushes fix + state update to feature/asiri-sast with Devin-Session-Id trailer
  -> re-scan validation (npm audit + Trivy again, diff against baseline)
```

## Triggers

| Trigger | Notes |
|---|---|
| `push` to `main` | Only human-authored pushes proceed (see provenance guard). |
| `schedule` `0 2 * * *` | Nightly at 02:00 UTC. |
| `workflow_dispatch` | Optional `branch` input (default `feature/asiri-sast`). |

`pull_request` is deliberately **not** a trigger, so the workflow never reacts
to PRs Devin itself opens. A top-level `concurrency` group cancels overlapping
runs.

## Scanners

- **npm audit**: `npm ci` then `npm audit --json` in `backend/` and
  `frontend/` (both hold a `package.json`; the root does not). A non-zero audit
  exit code never fails the job (`|| true`); the JSON is parsed instead.
  Reports: `npm-audit-backend.json`, `npm-audit-frontend.json`.
- **Trivy**: the repo has `docker/Dockerfile`, so the image is built
  (`docker build -f docker/Dockerfile .`) and scanned with
  `aquasecurity/trivy-action` (`trivy image --format json --severity HIGH,CRITICAL`,
  unfixed CVEs ignored). Report: `trivy-report.json`.

Node 20 is used; neither `package.json` declares an `engines` field, so the
version mirrors the Dockerfile and `pr-checks.yml`.

All reports plus the normalized list are uploaded as the `sast-reports`
artifact and summarized in the run's step summary.

## Normalization and fingerprints

Both reports are reduced with `jq` to a single `findings.json` array of
`{source, severity, package, installed, fixed, id, title, location, fix_available, fingerprint}`.

| Source | Fingerprint |
|---|---|
| npm audit | `npm:<package>@<vulnerable-range>:<GHSA advisory id>` |
| Trivy | `trivy:<CVE-ID>:<package>` |

Fingerprints are stable across runs and are the key for the retry budget.

## Circuit breakers

1. **Provenance guard** (`provenance` job) — the run stops (`should_run=false`,
   every downstream job is gated with `if:`) when:
   - `github.actor` or the head-commit author ends with `[bot]`,
   - the actor/author is Devin's account (`devin-ai-integration[bot]`), or
   - the head-commit message contains a `Devin-Session-Id:` trailer.

   Devin is instructed to add that trailer to every commit, and the workflow's
   own state commit carries one too, so neither can re-trigger the pipeline.

2. **Attempt counter** (`dispatch` job) — `.devin/remediation-state.json`
   on `feature/asiri-sast` stores
   `{"attempts": {"<fingerprint>": {"count": n, "last_attempt": ..., "last_session": ...}}}`.
   A fingerprint with `count >= 2` is **not** dispatched; it is logged as
   `needs-human-review` (workflow warning + `needs-human-review.json` in the
   `sast-gate` artifact). The workflow increments the counter when a session
   is created and commits the state file back to the branch, so a session that
   never lands a fix still consumes budget. Devin is also asked to update the
   same entry alongside its fix.

## Devin invocation

The repo already invokes Devin from `sast-scan.yml` and `pr-checks.yml`
via the v3 API; the new workflow reuses that pattern:

```
POST https://api.devin.ai/v3/organizations/org-732f6f756e234fe49c954e2ede7ecba9/sessions
Authorization: Bearer ${DEVIN_API_KEY}
{ "prompt": "...", "title": "...", "repos": ["<owner>/<repo>"],
  "create_as_user_id": "...", "tags": ["sast-auto-remediate", ...] }
```

One session is created per remaining CRITICAL/HIGH finding. The prompt contains
the fingerprint, source, severity, advisory/CVE id, package@version, fixed
version, and location, plus these instructions:

- check out the **existing** `feature/asiri-sast` branch — no new branch, no
  default-branch changes, no PR;
- minimal fix only, verified with `npm audit`, Trivy, `npm test` (backend) and
  `npm run build` (frontend);
- update `.devin/remediation-state.json` for the fingerprint;
- end every commit with `Devin-Session-Id: <session id>`.

### Required secrets

| Secret | Purpose |
|---|---|
| `DEVIN_API_KEY` | **Required.** Bearer token for the Devin API. Never hardcoded. |
| `DEVIN_CREATE_AS_USER_ID` | Optional; attributes sessions to a user. |

Add them under *Settings → Secrets and variables → Actions*. The Devin
organization id is fixed in the workflow's `env.DEVIN_ORG_ID`
(`org-732f6f756e234fe49c954e2ede7ecba9`).

## Re-scan validation

The `rescan` job waits (polling up to 45 minutes) for a commit with a
`Devin-Session-Id:` trailer to land on the branch, then re-runs `npm audit --json`
and the Trivy image scan on the updated branch and diffs fingerprints against
the baseline `findings.json`:

- **resolved** — present before, gone now;
- **remaining** — still present; these are retried on the next run until the
  two-attempt budget is exhausted, then flagged `needs-human-review`;
- **new** — appeared since the baseline.

Results are written to the step summary and the `sast-rescan` artifact.

## Running manually

GitHub UI: *Actions → SAST Auto-Remediate → Run workflow* (optionally set
`branch`). CLI:

```bash
gh workflow run "SAST Auto-Remediate" -f branch=feature/asiri-sast
gh run watch
```
