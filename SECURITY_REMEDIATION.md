# Security Remediation Report

Date: 2026-09-17
Scope: `frontend/` (React 19 + Vite), `backend/` (Express + SQLite), `docker/Dockerfile` (combined production image), `.github/workflows/`.
Tools: `npm audit` (npm 10, Node 22.12 locally), Trivy 0.74.0, OWASP ZAP (`ghcr.io/zaproxy/zaproxy:stable`, baseline scan).

## 1. Summary: before vs. after

| Scan | Target | Before (C / H / M / L) | After (C / H / M / L) |
|---|---|---|---|
| `npm audit` | `frontend/` | 0 / 14 / 5 / 1 (20 total) | **0 / 0 / 0 / 0** |
| `npm audit` | `backend/` | 1 / 13 / 6 / 3 (23 total) | **0 / 0 / 0 / 0** |
| `trivy fs .` (vuln) | `frontend/package-lock.json` | 0 / 19 / 25 / 1 (45 total) | **0 / 0 / 0 / 0** |
| `trivy fs .` (vuln) | `backend/package-lock.json` | 1 / 17 / 11 / 5 (34 total) | **0 / 0 / 0 / 0** |
| `trivy fs .` (secret) | `.github/workflows/deploy.yml` | 4 / 1 / 0 / 0 (5 secrets) | 4 / 1 / 0 / 0 – **not fixable by version bump, see §5** |
| `trivy fs .` (misconfig) | `docker/Dockerfile` | 0 findings | 0 findings |
| `trivy image timesheet-app:scan` | OS packages (alpine 3.23.4) | 0 / 4 / 16 / 30 (50 total) | **0 / 0 / 0 / 0** |
| `trivy image timesheet-app:scan` | Node.js packages (`/app/node_modules` + bundled npm) | 2 / 36 / 17 / 8 (63 total) | **0 / 0 / 0 / 0** |

Result: **0 CRITICAL/HIGH vulnerabilities remain** in dependencies or the container image. The only remaining findings are the 5 hardcoded secrets in `deploy.yml`, which require credential rotation (§5).

Verification after changes:
- `cd frontend && npm run build` – OK; `npm run lint` – OK
- `cd backend && npm test` – 161/161 tests pass (8 suites)
- `cd backend && npm start` – server starts, in-memory SQLite initialised
- `docker build -f docker/Dockerfile -t timesheet-app:scan .` – OK; container answers `GET /health` (200), serves the SPA at `/`, and `POST /api/auth/login` creates/returns the user.

## 2. Changes applied

### 2.1 `frontend/`
`npm audit fix` only (no `--force`, no `package.json` changes – all existing semver ranges already allowed the patched versions; only `package-lock.json` changed).

| Package | Severity | Advisory / CVE | Version change | Notes |
|---|---|---|---|---|
| axios | HIGH | GHSA-3g43-6gmg-66jw, GHSA-35jp-ww65-95wh, GHSA-898c-q2cr-xwhg (prototype-pollution → credential theft / MITM / header injection) | 1.13.2 → 1.20.0 | Runtime dependency. Minor bump, API unchanged. |
| react-router / react-router-dom | HIGH | 7.x advisories (≤7.17.0) | 7.10.0 → 7.18.4 | Runtime dependency. Minor bump; SPA routes verified in build. |
| vite | HIGH | GHSA-v6wh-96g9-6wx3 (launch-editor NTLM leak), GHSA-fx2h-pf6j-xcff (`server.fs.deny` bypass) | 7.2.6 → 7.3.6 | Dev-only. |
| rollup | HIGH | 4.x advisory (≤4.58.0) | 4.53.3 → 4.63.3 | Dev-only (bundler). |
| postcss | HIGH | 8.x advisory (≤8.5.22) | 8.5.6 → 8.5.28 | Dev-only. |
| nanoid | HIGH | GHSA-28wg-ghj8-5hjv, GHSA-2v37-7h3g-55p8, GHSA-xwg4-73v4-xw9w | 3.3.11 → 3.3.19 | Dev-only (postcss). |
| picomatch | HIGH | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj (ReDoS) | 4.0.3 → 4.0.7 | Dev-only. |
| minimatch | HIGH | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 (ReDoS) | 3.1.2 → 3.1.5, 9.0.5 → 9.0.9 | Dev-only (eslint). |
| brace-expansion | HIGH | GHSA-f886-m6hf-6m8v, GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895 (DoS) | 1.1.12 → 1.1.21, 2.0.2 → 2.1.7 | Dev-only. |
| browserslist | HIGH | GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g | 4.28.0 → 4.29.0 | Dev-only. |
| js-yaml | HIGH | GHSA-52cp-r559-cp3m, GHSA-2883-xcg3-v3hh (quadratic CPU) | 4.1.1 → 4.3.2 | Dev-only (eslint). |
| flatted | HIGH | GHSA-25h7-pfq9-p65f | 3.3.3 → 3.4.4 | Dev-only. |
| form-data | HIGH | GHSA-hmw2-7cc7-3qxx (CRLF injection) | 4.0.5 → 4.0.6 | Transitive of axios. |
| @babel/core | HIGH (Trivy) / unrated (npm) | GHSA-4x5r-pxfx-6jf8 (arbitrary file read via sourceMappingURL) | 7.28.5 → 7.29.7 | Dev-only. |
| follow-redirects, ajv, yaml, baseline-browser-mapping, @humanfs/node | MODERATE / LOW | see `npm audit` before output | patched via `npm audit fix` | Dev/transitive. |

### 2.2 `backend/`
`npm audit fix` fixed everything except the `sqlite3 → node-gyp@8 → tar@6 / make-fetch-happen / cacache / @tootallnate/once` chain, for which npm only offered `npm audit fix --force` (upgrade to `sqlite3@6.0.1`).

`sqlite3@6.0.1` was tried and rejected: its prebuilt Linux binary requires glibc ≥ 2.38, so `npm start` fails with `ERR_DLOPEN_FAILED … GLIBC_2.38 not found` on Ubuntu 22.04 (glibc 2.35) developer machines (the Alpine image and `ubuntu-latest` CI would have worked). To avoid that breaking change, `sqlite3` stays on 5.1.7 and the vulnerable transitive install-time chain is pinned via npm `overrides` in `backend/package.json`:

```json
"overrides": {
  "tar": "^7.5.21",
  "node-gyp": "^11.4.2",
  "picomatch@<3": "^2.3.2"
}
```

`node-gyp` and `tar` are only used by `sqlite3` when a prebuilt binary must be downloaded/extracted or compiled at `npm install` time; they are not loaded at runtime. `picomatch@<3` is required because npm refused to move the jest/nodemon transitive `picomatch@2.3.1` once overrides were present.

| Package | Severity | Advisory / CVE | Version change | Notes |
|---|---|---|---|---|
| tar | **CRITICAL** + 11 HIGH | GHSA-34x7-hfp2-rc4v, GHSA-8qq5-rm4j-mr97, GHSA-83g3-92jg-28cx, GHSA-qffp-2rhf-9h96, GHSA-9ppj-qmqm-q256, GHSA-r6q2-hw4h-h46w, GHSA-vmf3-w455-68vh, GHSA-w8wr-v893-vjvp, GHSA-23hp-3jrh-7fpw, GHSA-8x88-c5mf-7j5w, GHSA-gvwx-54wh-qm9j, GHSA-r292-9mhp-454m; CVE-2026-59873 (gzip bomb) etc. | 6.2.1 → 7.5.22 (override) | Install-time only (sqlite3 / node-gyp). tar v7 API is a superset for the `extract` usage in node-gyp/sqlite3; `npm ci` in Docker verified. |
| node-gyp (+ make-fetch-happen, cacache, http-proxy-agent) | HIGH (via tar) / LOW (@tootallnate/once) | chain advisories | 8.4.1 → 11.5.0 (override); cacache 15.3.0 → 19.0.1; make-fetch-happen 9.1.0 → 14.0.3; http-proxy-agent 4.0.1 → 7.0.2; @tootallnate/once removed | Install-time only. |
| jws | HIGH | GHSA-869p-cjfg-cm3x / CVE-2025-65945 (improper HMAC signature verification) | 3.2.2 → 3.2.3 | Transitive of `jsonwebtoken`, which is declared in `package.json` but not currently `require`d anywhere in `backend/src` (auth is header-based, see §6.2). Consider removing the unused dependency. |
| path-to-regexp | HIGH | GHSA-37ch-88jc-xwx2 / CVE-2026-4867 (ReDoS) | 0.1.12 → 0.1.13 | Runtime (express router). |
| ip-address | HIGH | GHSA-v2v4-37r5-5v8g, GHSA-mwp4-54f8-5fhr / CVE-2026-69192 | 10.1.0 → 10.7.2 | Transitive. |
| minimatch | HIGH | GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74 | 3.1.2 → 3.1.5 | Transitive. |
| brace-expansion | HIGH | 4 DoS advisories (see frontend) | 1.1.12 → 1.1.21 | Transitive. |
| picomatch | HIGH | GHSA-3v7f-55p6-f55p, GHSA-c2c7-rcm5-vvqj | 2.3.1 → 2.3.2 (override) | Dev-only (jest, nodemon). |
| js-yaml | HIGH | GHSA-h67p-54hq-rp68, GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh | 3.14.2 → 3.15.2 | Dev-only. |
| browserslist, form-data, @babel/core | HIGH | see frontend table | 4.28.0 → 4.29.0, 4.0.5 → 4.0.6, 7.28.5 → 7.29.7 | Dev-only. |
| express | MODERATE (via qs) | GHSA-w7fw-mjwx-w883, GHSA-6rw7-vpxm-498p, GHSA-q8mj-m7cp-5q26, GHSA-4mjr-xmp4-gh2g | express 4.22.1 → 4.22.3, qs 6.14.0 → 6.16.0, body-parser 1.20.4 → 1.20.8 | Runtime. Patch bumps. |
| joi | MODERATE | GHSA-q7cg-457f-vx79, GHSA-6w3j-5fw6-r9vr, GHSA-gg4h-3hg2-grpc (prototype pollution) | 17.13.3 → 17.13.8 | Runtime – request validation. |
| morgan | MODERATE | GHSA-4vj7-5mj6-jm8m, GHSA-jxfw-x594-9x9m (log forging) | 1.10.1 → 1.12.1 | Runtime. |

### 2.3 `docker/Dockerfile` (production stage)
There is no newer `node:20-alpine` tag with these fixes yet: the freshly pulled `node:20-alpine` (`sha256:fb4cd12c…`, Node 20.20.2, Alpine 3.23.4) still ships `openssl 3.5.6-r0` and bundled npm 10 with `tar@6.2.1`. Two changes were made instead:

| Finding | Severity | Fix |
|---|---|---|
| `libssl3` / `libcrypto3` 3.5.6-r0 – CVE-2026-14456 (OpenSSL DoS via unbounded memory), CVE-2026-45447 | HIGH ×4 (+ 46 MEDIUM/LOW alpine CVEs) | `RUN apk upgrade --no-cache` before `apk add dumb-init` → 3.5.8-r0 from the Alpine 3.23 repo. Image OS findings: 50 → 0. |
| Bundled npm under `/usr/local/lib/node_modules/npm` – `tar@6.2.1` (CRITICAL CVE-2026-59873 + HIGHs), `pacote` CVE-2026-9496, `sigstore` CVE-2026-48815, `glob` CVE-2025-64756, `cross-spawn` CVE-2024-21538, `minimatch`, `brace-expansion`, `ip-address` | 1 CRITICAL, ~20 HIGH | `RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx`. The production stage runs `node src/server.js` directly and never needs npm; the builder stages keep npm. |
| `/app/node_modules` – `tar`, `jws`, `ip-address`, `minimatch`, `brace-expansion`, `path-to-regexp` | 1 CRITICAL, ~16 HIGH | Fixed by the `backend/` lockfile changes in §2.2 (copied in via `npm ci --only=production`). |

Breaking-change notes: none observed. `HEALTHCHECK`, `ENTRYPOINT` and non-root `USER nodejs` are unchanged; the container was smoke-tested (§1).

## 3. Scan evidence

### 3.1 `npm audit` – before
`frontend/` (`/tmp/frontend-audit-before.json`):
```
20 vulnerabilities (1 low, 5 moderate, 14 high)
HIGH: axios 1.0.0-1.17.0, brace-expansion, browserslist, flatted, form-data, js-yaml, minimatch,
      nanoid, picomatch, postcss, react-router 6.0.0-7.17.0, rollup 4.0.0-4.58.0, vite 7.0.0-7.3.3
MODERATE: @humanfs/node, ajv, baseline-browser-mapping, follow-redirects, yaml
```
`backend/` (`/tmp/backend-audit-before.json`):
```
23 vulnerabilities (3 low, 6 moderate, 13 high, 1 critical)
CRITICAL: tar <=7.5.20 (12 advisories) – via sqlite3 > node-gyp > tar / cacache
HIGH: brace-expansion, browserslist, form-data, ip-address, js-yaml, jws <3.2.3, minimatch,
      path-to-regexp <0.1.13, picomatch
MODERATE: baseline-browser-mapping, body-parser, joi, morgan, qs (-> express)
LOW: @tootallnate/once, @babel/core
"fix available via `npm audit fix --force` – Will install sqlite3@6.0.1, which is a breaking change"
```

### 3.2 `npm audit` – after
```
frontend/  found 0 vulnerabilities   {"low":0,"moderate":0,"high":0,"critical":0,"total":0}
backend/   found 0 vulnerabilities   {"low":0,"moderate":0,"high":0,"critical":0,"total":0}
```

### 3.3 `trivy fs --scanners vuln,secret,misconfig .` – before
```
backend/package-lock.json (npm)      Total: 34 (LOW: 5, MEDIUM: 11, HIGH: 17, CRITICAL: 1)
frontend/package-lock.json (npm)     Total: 45 (LOW: 1, MEDIUM: 25, HIGH: 19, CRITICAL: 0)
.github/workflows/deploy.yml (secrets) Total: 5 (HIGH: 1, CRITICAL: 4)
  CRITICAL: AWS (aws-access-key-id)        CRITICAL: AWS (aws-secret-access-key)
  CRITICAL: GitHub (github-pat)            HIGH:     Slack (slack-access-token)
  CRITICAL: Stripe (stripe-secret-token)
docker/Dockerfile (dockerfile)       no misconfigurations reported
```

### 3.4 `trivy fs --scanners vuln,secret,misconfig .` – after
```
backend/package-lock.json (npm)      0 vulnerabilities
frontend/package-lock.json (npm)     0 vulnerabilities
.github/workflows/deploy.yml (secrets) Total: 5 (HIGH: 1, CRITICAL: 4)   <- unchanged, see §5
```

### 3.5 `trivy image timesheet-app:scan` – before
```
timesheet-app:scan (alpine 3.23.4)   Total: 50 (LOW: 30, MEDIUM: 16, HIGH: 4, CRITICAL: 0)
  HIGH libcrypto3/libssl3 3.5.6-r0  CVE-2026-14456 (fix 3.5.8-r0), CVE-2026-45447 (fix 3.5.7-r0)
Node.js (node-pkg)                   Total: 63 (LOW: 8, MEDIUM: 17, HIGH: 36, CRITICAL: 2)
  CRITICAL tar@6.2.1 CVE-2026-59873   app/node_modules/tar, usr/local/lib/node_modules/npm/node_modules/tar
  HIGH tar@6.2.1 (CVE-2026-23745, -23950, -24842, -26960, -29786, -31802, -59874, -73566) x2 locations
  HIGH jws@3.2.2 CVE-2025-65945, path-to-regexp@0.1.12 CVE-2026-4867, ip-address CVE-2026-69192,
       minimatch (CVE-2026-26996/-27903/-27904), brace-expansion (CVE-2026-13149/-14257/-69152),
       pacote@18.0.6 CVE-2026-9496, sigstore@2.3.1 CVE-2026-48815, glob@10.4.2 CVE-2025-64756,
       cross-spawn@7.0.3 CVE-2024-21538
```

### 3.6 `trivy image timesheet-app:scan` – after
```
timesheet-app:scan (alpine 3.23.4)   0 vulnerabilities
Node.js (node-pkg)                   0 vulnerabilities
```

## 4. Findings not remediated

| Finding | Reason |
|---|---|
| 5 hardcoded secrets in `.github/workflows/deploy.yml` | Not fixable by a dependency change; requires credential rotation and moving to GitHub Actions secrets by someone with access to the AWS/Slack/GitHub/Stripe accounts. See §5. No replacement values were invented. |
| `sqlite3` stays at 5.1.7 instead of 6.0.1 | 6.0.1 prebuilt binaries require glibc ≥ 2.38 and break `npm start` on Ubuntu 22.04. The vulnerable transitive chain is fully remediated via `overrides` instead (0 findings), so no vulnerability remains open. Revisit removing the overrides when dev machines are on glibc ≥ 2.38 or when sqlite3 6.x ships broader prebuilds. |
| `node:20-alpine` base image not bumped | No newer tag with patched OpenSSL / npm existed at scan time; mitigated with `apk upgrade` and removal of bundled npm. Because `apk upgrade` pulls whatever is current at build time, rebuilding the image periodically (or pinning by digest and bumping it) is needed to stay patched. |

## 5. Hardcoded secrets in `.github/workflows/deploy.yml`

Trivy's secret scanner flags five credentials committed in plaintext in `deploy.yml` (values intentionally not reproduced here):

| Line / step | Secret type | Trivy rule | Severity |
|---|---|---|---|
| "Configure AWS" – `AWS_ACCESS_KEY_ID` (`AKIA…`) | AWS access key ID | aws-access-key-id | CRITICAL |
| "Configure AWS" – `AWS_SECRET_ACCESS_KEY` | AWS secret access key | aws-secret-access-key | CRITICAL |
| "Publish release notes to Slack" – `SLACK_BOT_TOKEN` (`xoxb-…`) | Slack bot token | slack-access-token | HIGH |
| "Tag release in GitHub" – `GITHUB_PAT` (`ghp_…`) | GitHub personal access token | github-pat | CRITICAL |
| "Charge billing webhook" – `STRIPE_SECRET_KEY` (`sk_live_…`) | Stripe **live** secret key | stripe-secret-token | CRITICAL |

Because these values are in git history, they must be treated as compromised even after the file is edited.

Recommended actions (in order):
1. **Rotate/revoke every key immediately** in the respective provider: deactivate the AWS IAM access key (and review CloudTrail for misuse), revoke the Slack bot token (reinstall the app), delete the GitHub PAT, roll the Stripe live secret key in the Stripe dashboard (and review recent API activity).
2. **Store the new values as GitHub Actions secrets** (repo or environment level, e.g. `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SLACK_BOT_TOKEN`, `RELEASE_GITHUB_TOKEN`, `STRIPE_SECRET_KEY`) and reference them as `${{ secrets.NAME }}` in the workflow. Prefer **OIDC** (`aws-actions/configure-aws-credentials` with `role-to-assume`) over long-lived AWS keys, and use the built-in `${{ github.token }}` / a fine-grained PAT with minimal scope for tagging.
3. **Purge the history** (e.g. `git filter-repo` / BFG) after rotation if the repository is or may become shared, and enable **GitHub secret scanning + push protection** so this cannot recur.
4. Add `trivy fs --scanners secret` (or gitleaks) to `pr-checks.yml` so secrets fail the PR check. Note that `pr-checks.yml` currently only runs `npm audit` for `frontend/`; adding a `backend/` audit step (and a Trivy image scan) would have caught the CRITICAL `tar` finding.

## 6. DAST Feasibility (OWASP ZAP)

### 6.1 Standing the app up for scanning
The simplest target is the combined production image: `docker build -f docker/Dockerfile -t timesheet-app:scan .` then `docker run -d -p 3001:3001 timesheet-app:scan`. Express serves the built SPA and the API on `http://localhost:3001`, so a single origin covers both, and `GET /health` is a ready probe. The alternative – `backend` via `npm start` (3001) plus `frontend` via `npm run dev` (5173, proxying `/api`) – works too but scans the Vite dev server (different headers, HMR endpoints) rather than the production configuration in `docker/overrides/server.js` (which sets the helmet CSP), so results would be less representative.

### 6.2 Authentication handling
**Correction to the task brief:** the code does *not* issue a JWT. `POST /api/auth/login {"email": "..."}` (Joi-validated) only creates the user row if needed and returns `{ message, user }` – no token. Protected routes (`/api/clients`, `/api/work-entries`, `/api/reports/*`, `/api/auth/me`) are guarded by `backend/src/middleware/auth.js`, which reads the plain **`x-user-email` header**, auto-creates the user, and scopes every query by that email. `jsonwebtoken` is in `package.json` but unused. Security implications for DAST and beyond:
- Any client can act as any user simply by setting `x-user-email` – there is no secret, signature or session. This is an authentication design weakness that ZAP will *not* report (it looks like a valid header), and is arguably the most important runtime finding in this report. Moving to signed JWTs (the library is already installed) with `Authorization: Bearer <token>` is recommended.
- For scanning this makes auth trivial: no login script or token fetch is needed. Add a ZAP *Replacer* rule (Automation Framework `replacer` job or `-z "-config replacer.full_list(0).matchtype=REQ_HEADER -config replacer.full_list(0).matchstr=x-user-email -config replacer.full_list(0).replacement=zap@example.com ..."`) so every request carries `x-user-email: zap@example.com`; the user is created on first request.
- If the app is later moved to JWTs, the same Replacer approach works with a `curl`-pre-fetched token in an `Authorization: Bearer` header, or a ZAP JSON-based authentication context posting to `/api/auth/login` with a session script extracting the token.
- Feed ZAP an **OpenAPI definition** (the API has none today – one could be generated from `backend/src/routes/*.js`) so the spider knows the JSON endpoints instead of relying on crawling the SPA bundle.

### 6.3 Which ZAP mode
| | Baseline (`zap-baseline.py` / `zaproxy/action-baseline`) | Full active scan (`zap-full-scan.py` / `action-full-scan`) |
|---|---|---|
| What it does | Spiders (traditional + AJAX), passive checks only: headers, CSP, cookies, info leaks, CORS | Additionally sends attack payloads: SQLi, XSS, path traversal, parameter fuzzing |
| Duration | ~1–2 min for this app | 10–60+ min |
| Risk | None – no state changes | Writes through `POST/PUT/DELETE /api/clients` and `/api/work-entries`; hammers `/api/reports/*` PDF/CSV export (CPU-heavy pdfkit) and triggers `express-rate-limit`, so many probes return 429 and the scan is noisy/partial |
| Recommendation | **Start here**, in CI on every PR/main push | Run manually or nightly against a disposable container with the `x-user-email` header injected and the rate limit relaxed |

### 6.4 Expected value vs. cost
SonarCloud (SAST), `npm audit` (SCA) and Trivy (SCA + image + secrets) already cover code, dependencies and the image. ZAP's incremental value is runtime behaviour those tools cannot see: the effective security headers after `helmet` (CSP directives, COOP/COEP, Permissions-Policy), CORS configuration (production allows any origin with credentials), auth handling, information leakage in error responses, and rate-limit behaviour. Cost is low: one extra CI job of a few minutes. Because the container uses an in-memory / fresh file SQLite DB that resets on every start, even an active scan has effectively zero data-loss risk – the only real cost of active scanning is CI time and noise from rate limiting.

### 6.5 Evidence: ZAP Baseline scan executed
A baseline scan was run in this environment against the rebuilt image (unauthenticated, no `x-user-email` header):
```
docker run --rm --network host -v /tmp/zap:/zap/wrk:rw ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://localhost:3001 -r zap-baseline-report.html -J zap-baseline-report.json -I
Total of 7 URLs
FAIL-NEW: 0   WARN-NEW: 6   PASS: 61
```
Warnings (all Medium or lower, all header-configuration items):
| Alert | Risk | Notes |
|---|---|---|
| CSP: `script-src` / `style-src` `'unsafe-inline'`, "Failure to Define Directive with No Fallback" | Medium | From the explicit CSP in `docker/overrides/server.js` (`'unsafe-inline'` allowed for MUI/emotion styles; no `form-action`/`frame-ancestors` fallback). Consider nonces/hashes for scripts and adding `frame-ancestors 'none'`, `form-action 'self'`. |
| Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy missing | Low | `docker/overrides/server.js` explicitly sets `crossOriginOpenerPolicy: { policy: "unsafe-none" }`; COEP is not enabled by helmet by default. |
| Permissions-Policy header not set | Low | Add `Permissions-Policy: camera=(), microphone=(), geolocation=()` via helmet/Express. |
| Timestamp disclosure (Unix) in the JS bundle | Low | Build artefact noise; can be ignored. |
| Modern Web Application / Storable but non-cacheable content | Informational | — |

Nothing failed, confirming `helmet` is active (X-Powered-By removed, X-Content-Type-Options, X-Frame-Options, HSTS all pass). Only 7 URLs were reached because the JSON API is not discoverable by spidering the SPA bundle and every `/api/*` route answers 401 without `x-user-email` – a run with the header injected (§6.2) plus an explicit URL list or OpenAPI import is needed to exercise `/api/*`.

### 6.6 Recommendation
Add a ZAP Baseline job to CI as `.github/workflows/dast-scan.yml`, triggered on `pull_request` to `main` (and optionally a weekly schedule):

```yaml
name: DAST Baseline (OWASP ZAP)
on:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 3 * * 1'
permissions:
  contents: read
  issues: write        # only if the action should open issues
jobs:
  zap-baseline:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -f docker/Dockerfile -t timesheet-app:scan .
      - name: Run app
        run: |
          docker run -d --name app -p 3001:3001 timesheet-app:scan
          for i in $(seq 1 30); do curl -fs http://localhost:3001/health && break; sleep 2; done
      - name: ZAP Baseline (authenticated via x-user-email header)
        uses: zaproxy/action-baseline@v0.15.0
        with:
          target: http://localhost:3001
          cmd_options: >-
            -I -z "-config replacer.full_list(0).description=auth
            -config replacer.full_list(0).enabled=true
            -config replacer.full_list(0).matchtype=REQ_HEADER
            -config replacer.full_list(0).matchstr=x-user-email
            -config replacer.full_list(0).regex=false
            -config replacer.full_list(0).replacement=zap@example.com"
          allow_issue_writing: false
          fail_action: false
      - name: Stop app
        if: always()
        run: docker rm -f app
```
Start with `fail_action: false` and `-I` (ignore warnings) to get visibility without blocking merges, then tune `.zap/rules.tsv` to ignore accepted alerts (e.g. `'unsafe-inline'` for styles) and flip to blocking once the baseline is clean. Schedule a separate, non-blocking `zaproxy/action-full-scan` weekly against the same container if active testing is wanted; the in-memory DB makes it safe, but the limiter is hardcoded to 100 requests / 15 min per IP in `docker/overrides/server.js`, so either make `max` configurable via an env var for scan builds or expect most active-scan probes to return 429.
