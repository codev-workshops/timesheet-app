# SAST Auto-Remediation Architecture

This document describes how security scanning and Devin-driven auto-remediation are wired
into the timesheet-app repository.

## Overview

Two GitHub Actions workflows drive automated remediation. Both create a Devin session through
the Devin v3 API and rely on the same three repository secrets (`DEVIN_API_KEY`,
`DEVIN_ORG_ID`, `DEVIN_CREATE_AS_USER_ID`).

| Workflow | File | Scanner | Trigger | Where Devin commits |
|---|---|---|---|---|
| SAST Auto-Remediation (SonarCloud) | `.github/workflows/sast-scan.yml` | SonarCloud quality gate | `check_run: completed` from the `sonarqubecloud` app, failed conclusion, PR present | Directly on the PR head branch |
| SAST Auto-Remediate (npm audit + Trivy) | `.github/workflows/sast-auto-remediate.yml` | `npm audit` (backend/, frontend/) + Trivy image/filesystem scan | `pull_request: [opened, synchronize, reopened]` | New leaf branch off `feature/praveen-sast-demo`, PR targeting that base branch |

### `sast-scan.yml` (SonarCloud-driven)

1. Fires when a SonarCloud check run completes with `conclusion == failure` on a PR.
2. Validates the PR (author allow-list, PR open, no prior `"Devin SAST Auto-Fix"` comment).
3. Builds a prompt with the SonarCloud finding details and POSTs to
   `https://api.devin.ai/v3/organizations/${DEVIN_ORG_ID}/sessions`.
4. Posts a PR comment containing the marker so the workflow never triggers twice.

### `sast-auto-remediate.yml` (npm audit + Trivy-driven)

**Trigger model.** Runs on every `pull_request` `opened` / `synchronize` / `reopened` event.
The job is skipped entirely when the PR author is `devin-ai-integration[bot]`.

**Scan steps.**
- Checkout PR head, set up Node 20 (matches `docker/Dockerfile`).
- `npm audit --json` in `backend/` and `frontend/`, written to `scan-results/npm-audit-*.json`.
  Non-zero exit is tolerated (`|| true`); the JSON is captured regardless.
- `docker build -f docker/Dockerfile` followed by a Trivy **image** scan
  (`aquasecurity/trivy-action`, `format: json`, `severity: HIGH,CRITICAL`). If the image build
  fails, a Trivy **filesystem** scan of the repo is used as a fallback.

**Findings evaluation.** `jq` reads `.metadata.vulnerabilities.high` / `.critical` from each
npm audit report and counts Trivy `.Results[].Vulnerabilities[]` with `Severity` of `HIGH` or
`CRITICAL`. The sum yields `has_findings` and a Markdown `summary.md` (per-directory counts,
top npm advisories with fix availability, top Trivy CVEs with fixed versions). The summary is
appended to the job step summary and uploaded as an artifact.

**PR comment.** When `has_findings == true` and no prior attempt exists, a comment is posted via
`gh api repos/<repo>/issues/<pr>/comments` with the counts and top findings. Its heading contains
the marker string `Devin SAST Auto-Remediate`.

**Devin API invocation.** The same `curl` POST pattern as `sast-scan.yml`. The JSON body (built
with `jq`) contains `prompt`, `title`, `repos`, `create_as_user_id` and
`tags: ["sast-fix","npm-audit","trivy","security","automated"]`. On HTTP 200 the session
`url`/`session_id` are written to the step summary and a second marker comment is posted; any
other status fails the job with `::error::`.

The Devin API has no "target branch" parameter, so the base branch is enforced purely through
the prompt text, which instructs Devin to check out `feature/praveen-sast-demo`, create a leaf
branch from it, fix every listed finding (dependency bumps, `docker/Dockerfile` base image /
package updates), verify with `npm audit` / `trivy`, and open a PR **targeting
`feature/praveen-sast-demo`, never `main`**. The full findings summary is embedded in the prompt.

**Re-scan verification loop.** Devin's fix arrives asynchronously (its own PR/push), so
verification cannot happen in the same run. Instead, every subsequent run of the workflow on a
PR that already carries the marker comment is treated as a **verification re-scan**: it re-runs
npm audit and Trivy, and posts a comment titled "Devin SAST Auto-Remediate — Verification
Re-scan" with an explicit **PASS** (0 HIGH/CRITICAL) or **FAIL** (N remaining) result and the
current counts. No new Devin session is created in this mode.

## Branching strategy

```
main
 └── feature/praveen-sast-demo          <- base / integration branch for the demo
      ├── devin/<ts>-sast-fix-pr-<N>    <- leaf branch created by Devin (PR -> feature/praveen-sast-demo)
      └── devin/<ts>-sast-fix-pr-<M>    <- another leaf branch (PR -> feature/praveen-sast-demo)
```

- `feature/praveen-sast-demo` is the base branch for all auto-remediation work.
- Every Devin session creates a **new leaf branch off the base branch** and opens a PR
  **targeting the base branch**. Devin never pushes to `main`, never opens PRs against `main`,
  and never pushes to the scanned PR's head branch.
- The workflow's `BASE_BRANCH` env var is the single place this name is configured.

## Loop-prevention design

Three independent controls prevent the workflow from re-triggering itself:

1. **Author skip** — job-level `if: github.event.pull_request.user.login != 'devin-ai-integration[bot]'`.
   PRs opened by Devin (the remediation PRs) are never scanned by this workflow, so a fix PR
   cannot spawn another fix session.
2. **Comment marker** — before triggering, the job pages through PR comments looking for the
   `Devin SAST Auto-Remediate` string. If present, the run becomes a verification re-scan only.
   This enforces a single remediation attempt per PR, mirroring the `Devin SAST Auto-Fix`
   marker in `sast-scan.yml`.
3. **Concurrency** — `group: sast-auto-remediate-<pr-number>` with `cancel-in-progress: true`, so
   rapid pushes cancel superseded runs and at most one run per PR is active.

**TOCTOU considerations.** The marker check and the comment/session-creation steps are not
atomic: two runs on the same PR could both observe "no marker" before either posts one. The
concurrency group closes most of this window by cancelling in-progress runs for the same PR, and
the marker is posted *before* the Devin API call so the window between check and write is as
short as possible. A residual race remains if a cancelled run has already passed the guard;
the cost is at worst a duplicate Devin session (never an infinite loop, because of control 1).
Similarly, a comment deleted by a human re-opens the one-attempt gate — this is intentional and
gives maintainers a manual "retry" lever.

## Sequence diagram

```mermaid
sequenceDiagram
    participant Dev as "Developer"
    participant GH as "GitHub PR"
    participant WF as "sast-auto-remediate.yml"
    participant Scan as "npm audit + Trivy"
    participant Devin as "Devin (v3 API session)"
    participant Base as "feature/praveen-sast-demo"

    Dev->>GH: "Open / update PR"
    GH->>WF: "pull_request opened/synchronize"
    WF->>WF: "Skip if author is devin-ai-integration[bot]"
    WF->>Scan: "npm audit --json (backend, frontend); docker build + trivy image (fallback: trivy fs)"
    Scan-->>WF: "JSON results"
    WF->>WF: "jq: count HIGH/CRITICAL, build summary, has_findings"
    WF->>GH: "Check comments for marker (one-time attempt)"
    alt "has_findings and no marker"
        WF->>GH: "Post findings comment with marker"
        WF->>Devin: "POST /v3/organizations/{org}/sessions (prompt incl. findings + branch rules)"
        Devin-->>WF: "200 { url, session_id }"
        WF->>GH: "Post session-link comment"
        Devin->>Base: "Checkout base, create leaf branch, fix deps / Dockerfile"
        Devin->>GH: "Open PR: leaf branch -> feature/praveen-sast-demo"
    else "marker already present (verification re-scan)"
        WF->>GH: "Post Verification Re-scan comment: PASS / FAIL with counts"
    else "no findings"
        WF->>WF: "Write 'nothing to remediate' to step summary"
    end
```
