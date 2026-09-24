# Security Remediation Report — timesheet-app

Date: 2026-09-24
Scope: CRITICAL and HIGH findings from `npm audit --json` (backend + frontend) and `npx eslint . --format json`
(frontend). Cross-repo context and the full finding list live in `SECURITY_BACKLOG.md`.

## Before / after

| Workspace | Before (`npm audit`) | After (`npm audit`) |
|---|---|---|
| `backend/` | 23 advisories — 1 critical, 13 high, 6 moderate, 3 low | **0** |
| `frontend/` | 20 advisories — 0 critical, 14 high, 5 moderate, 1 low | **0** |
| `frontend/` ESLint | 0 violations | 0 violations |

Verification after the upgrades:

- `cd backend && npm audit --json` → `found 0 vulnerabilities`
- `cd frontend && npm audit --json` → `found 0 vulnerabilities`
- `cd frontend && npx eslint . --format json` → 0 messages
- `cd backend && npm test` → 8 suites / 161 tests passed
- `cd frontend && npm run lint && npm run build` → clean, build succeeds

## What was changed

### backend/

| Package (path) | Before | After | Advisories closed |
|---|---|---|---|
| `sqlite3` (direct, **semver-major**) | 5.1.7 | **6.0.1** | CRITICAL `tar` chain: CVE-2026-23950, CVE-2026-24842, CVE-2026-26960, CVE-2026-59873, CVE-2026-59874, CVE-2026-73566, CVE-2026-59871, CVE-2026-59875, CVE-2026-23745, CVE-2026-29786, CVE-2026-31802, CVE-2026-53655; HIGH `node-gyp`, `make-fetch-happen`, `cacache`; LOW `@tootallnate/once`, `http-proxy-agent` |
| `tar` (transitive via sqlite3 → node-gyp) | 6.2.1 | 7.5.22 | (same as above) |
| `jws` (transitive via jsonwebtoken) | 3.2.2 | 3.2.3 | HIGH CVE-2025-65945 / GHSA-869p-cjfg-cm3x — HMAC signature verification bypass |
| `path-to-regexp` (transitive via express) | 0.1.12 | 0.1.13 | HIGH CVE-2026-4867 / GHSA-37ch-88jc-xwx2 — ReDoS |
| `form-data` | 4.0.5 | 4.0.6 | HIGH CVE-2026-12143 / GHSA-hmw2-7cc7-3qxx — CRLF injection |
| `minimatch` | 3.1.2 | 3.1.5 | HIGH GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74, GHSA-3ppc-4f35-3m26 — ReDoS |
| `brace-expansion` | 1.1.12 | 1.1.21 | HIGH GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895, GHSA-f886-m6hf-6m8v, GHSA-3jxr-9vmj-r5cp — DoS |
| `js-yaml` | 3.14.2 | 3.15.2 | HIGH GHSA-52cp-r559-cp3m, GHSA-5p4m-2wfm-xmqj, GHSA-2883-xcg3-v3hh, GHSA-h67p-54hq-rp68 — quadratic CPU |
| `picomatch` | 2.3.1 | 2.3.2 | HIGH GHSA-c2c7-rcm5-vvqj, GHSA-3v7f-55p6-f55p |
| `browserslist` | 4.28.0 | 4.29.0 | HIGH GHSA-c83g-rgw3-j3cx, GHSA-73wf-gq98-2v4g |
| `ip-address` | 10.1.0 | removed (no longer in tree after sqlite3 6.x) | HIGH GHSA-v2v4-37r5-5v8g, GHSA-mwp4-54f8-5fhr |
| `express` / `body-parser` / `qs` | 4.22.1 / 1.20.4 / 6.14.0 | 4.22.3 / 1.20.8 / 6.16.0 | MEDIUM (pulled in by `npm audit fix`) |
| `joi`, `morgan` | 17.13.3, 1.10.1 | 17.13.8, 1.12.1 | MEDIUM (pulled in by `npm audit fix`) |

Only `backend/package.json` changed semantically (`sqlite3 ^5.1.6 → ^6.0.1`); everything else is a lockfile
refresh via `npm audit fix`. `sqlite3` 6.x has the same JS API used in `backend/src/database/`; the full Jest
suite (which exercises the SQLite layer through Supertest) passes unchanged.

### frontend/

No `package.json` ranges needed to change — all fixes were reachable inside the existing caret ranges, so this is a
lockfile-only refresh via `npm audit fix`.

| Package | Before | After | Advisories closed |
|---|---|---|---|
| `axios` (direct) | 1.13.2 | 1.20.0 | HIGH — 29 advisories incl. CVE-2026-44494 / GHSA-35jp-ww65-95wh (8.7, MitM via prototype pollution), GHSA-43fc-jf86-j433, GHSA-777c-7fjr-54vf, GHSA-hfxv-24rg-xrqf, GHSA-62hf-57xw-28j9, GHSA-j5f8-grm9-p9fc (all 7.5) |
| `react-router-dom` / `react-router` (direct) | 7.10.0 | 7.18.4 | HIGH — CVE-2026-42211 / GHSA-49rj-9fvp-4h2h (8.1, unauth RCE via turbo-stream), GHSA-8v8x-cx79-35w7 (8.2), GHSA-2w69-qvjg-hvjx (8.0), GHSA-8646-j5j9-6r62 (8.0), GHSA-rxv8-25v2-qmq8, GHSA-8x6r-g9mw-2r78 (7.5) and 7 more |
| `vite` (direct, dev) | 7.2.6 | 7.3.6 | HIGH — GHSA-fx2h-pf6j-xcff, GHSA-4w7w-66w2-5vf9, GHSA-v2wj-q39q-566r, GHSA-p9ff-h696-f583, GHSA-v6wh-96g9-6wx3 |
| `rollup` (dev) | 4.53.3 | 4.63.5 | HIGH CVE-2026-27606 / GHSA-mw96-cpmx-2vgc — arbitrary file write |
| `postcss` (dev) | 8.5.6 | 8.5.28 | HIGH GHSA-r28c-9q8g-f849, GHSA-6g55-p6wh-862q, GHSA-qx2v-qp2m-jg93 |
| `nanoid` (dev) | 3.3.11 | 3.3.19 | HIGH GHSA-xwg4-73v4-xw9w, GHSA-2v37-7h3g-55p8, GHSA-28wg-ghj8-5hjv |
| `flatted`, `form-data`, `js-yaml`, `minimatch`, `brace-expansion`, `picomatch`, `browserslist` (dev/transitive) | various | latest patch | HIGH (see `SECURITY_BACKLOG.md`) |
| `ajv`, `yaml`, `follow-redirects`, `@humanfs/node`, `baseline-browser-mapping`, `@babel/core` | various | latest patch | MEDIUM / LOW (pulled in by `npm audit fix`) |

### ESLint

`npx eslint . --format json` in `frontend/` reported **0 violations** before and after, so no source changes were
required. `backend/` ships no ESLint configuration; the command runs but has no rules to apply. Recommended
follow-up (not in this PR): add an `eslint.config.js` to `backend/` with `eslint-plugin-security` / `eslint-plugin-n`.

## Residual risk / follow-ups

- Advisory IDs above are GitHub Security Advisory IDs; CVE mappings for every advisory are in `SECURITY_BACKLOG.md`.
- `sqlite3` was moved across a major version. Native binary prebuilds are downloaded at install time; CI images
  must be able to compile or fetch `sqlite3@6.x` prebuilds for Node 20.
- Dependency freshness will drift again; consider enabling Dependabot/Renovate for `backend/` and `frontend/`.
