# Security Remediation Report — Dependency & Filesystem Scan

Scope: `backend/` and `frontend/` npm workspaces, `docker/Dockerfile`, GitHub workflows / IaC in the repo root.
Base branch: `feature/praveen-secscan-demo` (cut from `main` @ `82cdf7c`). Scan date: 2026-09-30.

Remediation is delivered in three PRs, all targeting `feature/praveen-secscan-demo`:

| Branch | Content |
|---|---|
| `feature/praveen-secscan-demo-backend-audit-fixes` | `backend/package.json` (`overrides.tar`) + `backend/package-lock.json` |
| `feature/praveen-secscan-demo-frontend-audit-fixes` | `frontend/package-lock.json` |
| `feature/praveen-secscan-demo-remediation-report` | this report + `security-evidence/` |

The "after" evidence was produced on a working tree containing both dependency PRs.

## 1. Methodology

| Tool | Version |
|---|---|
| Node.js / npm | v20.20.2 / 10.8.2 |
| Trivy | 0.74.0 (vuln DB v2 updated 2026-09-30 07:10 UTC, check bundle `sha256:1583562f…`) |

Commands (run from repo root unless noted):

```bash
# npm audit — both workspaces (CI's pr-checks.yml only audits frontend/)
(cd backend  && npm audit --json > ../security-evidence/before/npm-audit-backend.json)
(cd frontend && npm audit --json > ../security-evidence/before/npm-audit-frontend.json)

# Trivy — lockfiles, Dockerfile, IaC/workflows, secrets
trivy fs --scanners vuln,secret,misconfig --format json -o security-evidence/before/trivy-fs.json .
trivy convert --format table security-evidence/before/trivy-fs.json > security-evidence/before/trivy-fs.txt
# Trivy suppresses devDependencies by default; second pass so dev-only CVEs are cross-checked too
trivy fs --scanners vuln --include-dev-deps --severity HIGH,CRITICAL --format json \
  -o security-evidence/before/trivy-fs-include-dev-deps.json .
```

The same commands were re-run after remediation into `security-evidence/after/`. Trivy JSON files are minified (`jq -c`) but otherwise unmodified.

Remediation approach:

- `npm audit fix` (no `--force`) in each workspace for everything fixable within existing semver ranges.
- `--before=2026-09-22` was passed to npm so every newly resolved version is at least 7 days old (supply-chain hygiene; e.g. avoids `browserslist@4.29.3` / `rollup@4.63.5` published < 7 days ago).
- Transitive `tar` (only reachable through `sqlite3@5.1.7 → node-gyp`) fixed with a root `overrides` entry instead of the semver-major `sqlite3@6` upgrade that `npm audit fix --force` proposes.

## 2. Summary

| Scanner | Target | Before (C / H) | After (C / H) |
|---|---|---|---|
| npm audit | backend | 1 / 14 (23 total) | **0 / 0** (5 low) |
| npm audit | frontend | 0 / 14 (20 total) | **0 / 0** (0 total) |
| Trivy vuln (prod deps) | backend/package-lock.json | 1 / 20 | **0 / 0** (1 low) |
| Trivy vuln (prod deps) | frontend/package-lock.json | 0 / 19 | **0 / 0** |
| Trivy vuln (incl. dev deps) | both lockfiles | see JSON | **0 / 0** |
| Trivy misconfig | docker/Dockerfile | 0 failures (27 passed) | 0 failures |
| Trivy secret | .github/workflows/deploy.yml | 4 critical / 1 high | unchanged — see §5 |

## 3. Critical / high findings — before → after

Severity is npm audit's package-level severity; per-advisory severity in parentheses (C = critical, H = high). CVE IDs are taken from Trivy's cross-reference of the GHSA; GHSA-only entries have no CVE assigned. "(dev)" = devDependency-only path; "(direct)" = declared in `package.json`. Rows whose fixed version equals the installed version were flagged only because of a vulnerable child (`tar`) and are resolved by that child's fix.

| Workspace | Package | Installed | Fixed (now resolved) | Severity | CVE / Advisory | Source |
|---|---|---|---|---|---|---|
| backend | `brace-expansion` | 1.1.12 | 1.1.21 | HIGH | CVE-2026-13149 / GHSA-3jxr-9vmj-r5cp (H)<br>CVE-2026-14257 / GHSA-mh99-v99m-4gvg (H)<br>CVE-2026-69152 / GHSA-rgw5-rvv9-x895 (H)<br>CVE-2026-102278 / GHSA-qhr7-859c-m2p7 (H)<br>CVE-2026-102276 / GHSA-6j4f-fj2g-mc7p (H) | npm audit + Trivy |
| backend | `browserslist` (dev) | 4.28.0 | 4.29.0 | HIGH | CVE-2026-73089 / GHSA-c83g-rgw3-j3cx (H)<br>CVE-2026-73088 / GHSA-73wf-gq98-2v4g (H) | npm audit + Trivy |
| backend | `cacache` | 15.3.0 | 15.3.0 | HIGH | transitive via tar | npm audit |
| backend | `form-data` (dev) | 4.0.5 | 4.0.6 | HIGH | CVE-2026-12143 / GHSA-hmw2-7cc7-3qxx (H) | npm audit + Trivy |
| backend | `ip-address` | 10.1.0 | 10.7.2 | HIGH | CVE-2026-69192 / GHSA-mwp4-54f8-5fhr (H) | npm audit + Trivy |
| backend | `joi` (direct) | 17.13.3 | 17.13.8 | HIGH | GHSA-6h2x-m376-mqjq (H) | npm audit + Trivy |
| backend | `js-yaml` (dev) | 3.14.2 | 3.15.2 | HIGH | CVE-2026-59869 / GHSA-52cp-r559-cp3m (H)<br>GHSA-5p4m-2wfm-xmqj (H)<br>CVE-2026-84375 / GHSA-2883-xcg3-v3hh (H) | npm audit + Trivy |
| backend | `jws` | 3.2.2 | 3.2.3 | HIGH | CVE-2025-65945 / GHSA-869p-cjfg-cm3x (H) | npm audit + Trivy |
| backend | `make-fetch-happen` | 9.1.0 | 9.1.0 | HIGH | transitive via cacache, http-proxy-agent | npm audit |
| backend | `minimatch` | 3.1.2 | 3.1.5 | HIGH | CVE-2026-26996 / GHSA-3ppc-4f35-3m26 (H)<br>CVE-2026-27903 / GHSA-7r86-cg39-jmmj (H)<br>CVE-2026-27904 / GHSA-23c5-xmqv-rm74 (H) | npm audit + Trivy |
| backend | `node-gyp` | 8.4.1 | 8.4.1 | HIGH | transitive via make-fetch-happen, tar | npm audit |
| backend | `path-to-regexp` | 0.1.12 | 0.1.13 | HIGH | CVE-2026-4867 / GHSA-37ch-88jc-xwx2 (H) | npm audit + Trivy |
| backend | `picomatch` (dev) | 2.3.1 | 2.3.2 | HIGH | CVE-2026-33671 / GHSA-c2c7-rcm5-vvqj (H) | npm audit + Trivy |
| backend | `sqlite3` (direct) | 5.1.7 | 5.1.7 | HIGH | transitive via node-gyp, tar | npm audit |
| backend | `tar` | 6.2.1 | 7.5.22 | CRITICAL | CVE-2026-24842 / GHSA-34x7-hfp2-rc4v (H)<br>CVE-2026-23745 / GHSA-8qq5-rm4j-mr97 (H)<br>CVE-2026-26960 / GHSA-83g3-92jg-28cx (H)<br>CVE-2026-29786 / GHSA-qffp-2rhf-9h96 (H)<br>CVE-2026-31802 / GHSA-9ppj-qmqm-q256 (H)<br>CVE-2026-23950 / GHSA-r6q2-hw4h-h46w (H)<br>CVE-2026-59873 / GHSA-23hp-3jrh-7fpw (C)<br>CVE-2026-59874 / GHSA-8x88-c5mf-7j5w (H)<br>CVE-2026-73566 / GHSA-r292-9mhp-454m (H) | npm audit + Trivy |
| frontend | `axios` (direct) | 1.13.2 | 1.20.0 | HIGH | CVE-2026-42043 / GHSA-pmwg-cvhr-8vh7 (H)<br>CVE-2026-42033 / GHSA-pf86-5x62-jrwf (H)<br>CVE-2026-42035 / GHSA-6chq-wfr3-2hj9 (H)<br>CVE-2026-25639 / GHSA-43fc-jf86-j433 (H)<br>CVE-2026-42264 / GHSA-q8qp-cvcw-x6jj (H)<br>CVE-2026-44496 / GHSA-hfxv-24rg-xrqf (H)<br>CVE-2026-44488 / GHSA-777c-7fjr-54vf (H)<br>CVE-2026-44487 / GHSA-p92q-9vqr-4j8v (H)<br>CVE-2026-44486 / GHSA-j5f8-grm9-p9fc (H)<br>CVE-2026-44495 / GHSA-3g43-6gmg-66jw (H)<br>CVE-2026-44494 / GHSA-35jp-ww65-95wh (H) | npm audit + Trivy |
| frontend | `brace-expansion` (dev) | 2.0.2, 1.1.12 | 2.1.7, 1.1.21 | HIGH | CVE-2026-13149 / GHSA-3jxr-9vmj-r5cp (H)<br>CVE-2026-14257 / GHSA-mh99-v99m-4gvg (H)<br>CVE-2026-69152 / GHSA-rgw5-rvv9-x895 (H)<br>CVE-2026-102278 / GHSA-qhr7-859c-m2p7 (H)<br>CVE-2026-102276 / GHSA-6j4f-fj2g-mc7p (H) | npm audit + Trivy |
| frontend | `browserslist` (dev) | 4.28.0 | 4.29.0 | HIGH | CVE-2026-73089 / GHSA-c83g-rgw3-j3cx (H)<br>CVE-2026-73088 / GHSA-73wf-gq98-2v4g (H) | npm audit + Trivy |
| frontend | `flatted` (dev) | 3.3.3 | 3.4.4 | HIGH | CVE-2026-32141 / GHSA-25h7-pfq9-p65f (H)<br>CVE-2026-33228 / GHSA-rf6f-7fwh-wjgh (H) | npm audit + Trivy |
| frontend | `form-data` | 4.0.5 | 4.0.6 | HIGH | CVE-2026-12143 / GHSA-hmw2-7cc7-3qxx (H) | npm audit + Trivy |
| frontend | `js-yaml` (dev) | 4.1.1 | 4.3.2 | HIGH | CVE-2026-59869 / GHSA-52cp-r559-cp3m (H)<br>GHSA-5p4m-2wfm-xmqj (H)<br>CVE-2026-84375 / GHSA-2883-xcg3-v3hh (H) | npm audit + Trivy |
| frontend | `minimatch` (dev) | 9.0.5, 3.1.2 | 9.0.9, 3.1.5 | HIGH | CVE-2026-26996 / GHSA-3ppc-4f35-3m26 (H)<br>CVE-2026-27903 / GHSA-7r86-cg39-jmmj (H)<br>CVE-2026-27904 / GHSA-23c5-xmqv-rm74 (H) | npm audit + Trivy |
| frontend | `nanoid` (dev) | 3.3.11 | 3.3.19 | HIGH | CVE-2026-67214 / GHSA-28wg-ghj8-5hjv (H)<br>CVE-2026-67213 / GHSA-2v37-7h3g-55p8 (H)<br>CVE-2026-73086 / GHSA-xwg4-73v4-xw9w (H) | npm audit + Trivy |
| frontend | `picomatch` (dev) | 4.0.3 | 4.0.7 | HIGH | CVE-2026-33671 / GHSA-c2c7-rcm5-vvqj (H) | npm audit + Trivy |
| frontend | `postcss` (dev) | 8.5.6 | 8.5.28 | HIGH | CVE-2026-45623 / GHSA-6g55-p6wh-862q (H)<br>CVE-2026-73646 / GHSA-r28c-9q8g-f849 (H) | npm audit + Trivy |
| frontend | `react-router` | 7.10.0 | 7.18.4 | HIGH | CVE-2026-22029 / GHSA-2w69-qvjg-hvjx (H)<br>CVE-2026-42211 / GHSA-49rj-9fvp-4h2h (H)<br>CVE-2026-33245 / GHSA-8646-j5j9-6r62 (H)<br>CVE-2026-42342 / GHSA-8x6r-g9mw-2r78 (H)<br>CVE-2026-34077 / GHSA-rxv8-25v2-qmq8 (H)<br>CVE-2026-55685 / GHSA-chx6-hx7r-mcp5 (H)<br>CVE-2026-21884 / GHSA-8v8x-cx79-35w7 (H) | npm audit + Trivy |
| frontend | `react-router-dom` (direct) | 7.10.0 | 7.18.4 | HIGH | transitive via react-router | npm audit |
| frontend | `rollup` (dev) | 4.53.3 | 4.63.4 | HIGH | CVE-2026-27606 / GHSA-mw96-cpmx-2vgc (H) | npm audit + Trivy |
| frontend | `vite` (direct) (dev) | 7.2.6 | 7.3.6 | HIGH | CVE-2026-39364 / GHSA-v2wj-q39q-566r (H)<br>CVE-2026-39363 / GHSA-p9ff-h696-f583 (H)<br>CVE-2026-53571 / GHSA-fx2h-pf6j-xcff (H) | npm audit + Trivy |

## 4. Fix applied per finding

| Workspace | Fix |
|---|---|
| backend | `npm audit fix`: `brace-expansion` 1.1.21, `browserslist` 4.29.0, `form-data` 4.0.6, `ip-address` 10.7.2, `joi` 17.13.8, `js-yaml` 3.15.2, `jws` 3.2.3, `minimatch` 3.1.5, `path-to-regexp` 0.1.13 (via `express` 4.22.3), `picomatch` 2.3.2 — all within existing `package.json` ranges, lockfile-only. |
| backend | `"overrides": { "tar": "^7.5.22" }` in `backend/package.json` → `tar` 6.2.1 → 7.5.22 for `sqlite3`, `node-gyp` and `cacache`. Clears the critical `tar` chain (`tar`, `cacache`, `make-fetch-happen`, `node-gyp`, `sqlite3`) without a semver-major `sqlite3` bump. |
| frontend | `npm audit fix` (lockfile-only, in-range): `axios` 1.20.0 (+ `form-data` 4.0.6, `follow-redirects` 1.16.0), `react-router`/`react-router-dom` 7.18.4, `vite` 7.3.6 (+ `rollup` 4.63.4, `esbuild` 0.28.2, `postcss` 8.5.28, `nanoid` 3.3.19, `picomatch` 4.0.7), `browserslist` 4.29.0, `flatted` 3.4.4, `js-yaml` 4.3.2, `minimatch` 9.0.9 / 3.1.5, `brace-expansion` 2.1.7 / 1.1.21. |
| docker | No Trivy misconfiguration failures (27/27 checks pass: non-root `USER`, `HEALTHCHECK`, pinned base tag, etc.) — no change required. |

### Verification

```text
# npm audit --json → .metadata.vulnerabilities (after)
backend : {"info":0,"low":5,"moderate":0,"high":0,"critical":0,"total":5}
frontend: {"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}

# trivy fs --scanners vuln,secret,misconfig . (after)
backend/package-lock.json   npm         LOW=1 (0 HIGH/CRITICAL)
frontend/package-lock.json  npm         0
docker/Dockerfile           dockerfile  0 misconfigurations
.github/workflows/deploy.yml  secrets   5 (unchanged, see §5)

# trivy fs --scanners vuln --include-dev-deps --severity HIGH,CRITICAL . (after)
backend/package-lock.json 0, frontend/package-lock.json 0
```

Regression checks (after):

| Check | Result |
|---|---|
| `backend`: `npm ci && npm test` | 8/8 suites, 161/161 tests pass |
| `backend`: clean `npm ci` in an empty dir + `sqlite3` in-memory query | OK (prebuilt binary, SQLite 3.44.2) |
| `frontend`: `npm ci && npm run build` (`tsc -b && vite build`) | OK |
| `frontend`: `npm run lint` | OK, 0 problems |

Raw artifacts: `security-evidence/before/` and `security-evidence/after/` (`npm-audit-*.json`, `trivy-fs.json`, `trivy-fs.txt`, `trivy-fs-include-dev-deps.json`).

## 5. Known issues / not fixed

### 5.1 Hardcoded secrets (require rotation — not changed in this remediation)

Detected by Trivy's secret scanner (values masked in the evidence):

| File:line | Trivy rule | Severity |
|---|---|---|
| `.github/workflows/deploy.yml:15` | aws-access-key-id (`AWS_ACCESS_KEY_ID`) | CRITICAL |
| `.github/workflows/deploy.yml:16` | aws-secret-access-key (`AWS_SECRET_ACCESS_KEY`) | CRITICAL |
| `.github/workflows/deploy.yml:23` | slack-access-token (`SLACK_BOT_TOKEN`) | HIGH |
| `.github/workflows/deploy.yml:29` | github-pat (`GITHUB_PAT`) | CRITICAL |
| `.github/workflows/deploy.yml:35` | stripe-secret-token (`STRIPE_SECRET_KEY`) | CRITICAL |

**Not detected by Trivy** (found by manual review of `backend/src/config/production.js`): Trivy 0.74.0's built-in rules do not match these formats, so they do not appear in `trivy-fs.json`.

| File:line | Item |
|---|---|
| `backend/src/config/production.js:7` | hardcoded JWT signing secret (`jwt.secret`) |
| `backend/src/config/production.js:11` | database connection URL with embedded credentials (`database.url`) |
| `backend/src/config/production.js:14` | SendGrid API key (`sendgrid.apiKey`) |

Required action: treat every value above as compromised — revoke/rotate at the provider (AWS IAM, Slack, GitHub, Stripe, SendGrid, DB user, JWT key), move them to GitHub Actions secrets / a secret manager referenced via `${{ secrets.* }}` and environment variables, and purge them from git history. Rotation is out of scope for dependency remediation.

### 5.2 Residual low-severity findings (backend)

| Package | Severity | Advisory | Why not fixed |
|---|---|---|---|
| `@tootallnate/once` < 2.0.1 (via `http-proxy-agent@4` → `make-fetch-happen@9` → `node-gyp@8` → `sqlite3@5.1.7`) | LOW | GHSA-vpq2-c234-7xj6 (Incorrect Control Flow Scoping) | Only fix is `sqlite3@6.0.1` (semver-major, requires Node ≥ 20.17). Below the critical/high bar; `node-gyp` only runs when no prebuilt `sqlite3` binary is available. Recommend a follow-up `sqlite3@6` upgrade. |

### 5.3 Notes / caveats

- `overrides.tar ^7.5.22` forces `node-gyp@8.4.1` (source-build fallback for `sqlite3@5`) onto `tar@7`. Normal installs use `sqlite3`'s prebuilt binary (verified with a clean `npm ci`), so `node-gyp` does not execute; platforms that need a source build should move to `sqlite3@6`, which depends on `tar ^7.5.10` natively.
- CI gap: `.github/workflows/pr-checks.yml` (lines 34–76) only runs `npm audit` in `frontend/`; `backend/` should be added to prevent regressions.
