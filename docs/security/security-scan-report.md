# Security Scan Report — timesheet-app

**Date:** 2026-09-17 · **Branch:** `feature/praveen-demo-sast` · **Commit scanned:** `82cdf7c`
**Tools:** npm audit (SCA), Semgrep (SAST), OWASP ZAP (DAST) — all run in a Devin cloud VM.
**Scope:** analysis/reporting only. No application code, CI workflows, or dependencies were modified and no findings were remediated.

> None of the three tools required an NVD API key. npm audit uses the GitHub Advisory Database via the npm registry, Semgrep uses the public Semgrep Registry (no `SEMGREP_APP_TOKEN`), and ZAP is self-contained.

Raw outputs are committed under [`artifacts/`](./artifacts/).

---

## 1. Executive summary

| Tool | Target | Critical | High | Medium/Moderate | Low | Info | Total |
|---|---|---|---|---|---|---|---|
| npm audit | `frontend/` | 0 | 14 | 5 | 1 | 0 | **20** |
| npm audit | `backend/` | 1 | 13 | 6 | 3 | 0 | **23** |
| Semgrep | `backend/src`, `frontend/src` | 0 | 0 | 0 | 0 | 5 | **5** |
| OWASP ZAP baseline (passive) | `http://localhost:3001` (SPA + static) | 0 | 0 | 3 | 4 | 2 | **9** |
| OWASP ZAP API scan (active, authenticated) | `/api/*` via OpenAPI | 0 | 0 | 0 | 4 | 3 | **7** |

Severity terms per tool: npm audit uses info/low/moderate/high/critical; Semgrep uses INFO/WARNING/ERROR; ZAP uses Informational/Low/Medium/High. Counts are distinct vulnerable packages (npm audit), distinct findings (Semgrep), and distinct alert types (ZAP).

### Top-priority issues

1. **Backend runtime dependencies with known CVEs (npm audit — backend, first ever audit of this directory).**
   - `express@4.22.1` → `path-to-regexp <0.1.13` (**high**, ReDoS via multiple route params) and `qs`/`body-parser` (**moderate**, DoS). Fixable with `npm audit fix`.
   - `jsonwebtoken@9.0.2` → `jws <3.2.3` (**high**, improper HMAC signature verification). Fixable with `npm audit fix`. Note: `jsonwebtoken` is declared but *not used* anywhere in `backend/src` (only referenced in `config/production.js`), so runtime exposure is nil today, but it should be removed or bumped.
   - `sqlite3@5.1.7` → `tar <=7.5.20` (**critical**, arbitrary file overwrite / path traversal during extraction) plus `node-gyp`, `make-fetch-happen`, `cacache`, `ip-address`. These are install-time (native build) dependencies, not request-path code, but only resolve via a **major bump to `sqlite3@6.0.1`** (`npm audit fix --force`).
   - `joi@17.13.3` (**moderate**, prototype pollution / RangeError) and `morgan@1.10.1` (**moderate**, log forging) — both direct runtime deps, fixable with `npm audit fix`.
2. **Frontend runtime dependencies (npm audit — frontend).** `axios@1.13.2` (**high**, 29 advisories incl. SSRF, prototype-pollution response tampering, credential leak) and `react-router-dom@7.10.0` (**high**, XSS via open redirect, turbo-stream RCE in SSR mode, DoS). Both are direct deps and fixable with `npm audit fix` (axios ≥1.18.0, react-router ≥7.17.1).
3. **Schema drift in the Docker image causes 500s on `/api/clients` (ZAP API scan).** `docker/overrides/database/init.js` creates the `clients` table without the `department` column that `backend/src/routes/clients.js` selects, so every authenticated `GET /api/clients` and `GET /api/clients/:id` in the container returns `500 {"error":"Internal server error"}` (`SQLITE_ERROR: no such column: department`). ZAP flagged this as *Server Error / Application Error Disclosure / Debug Error Messages*. Functionally the containerised app cannot list clients; security-wise it is an availability and information-disclosure issue.
4. **Missing CSRF protection (Semgrep, 5× INFO) and header-only authentication model.** `authenticateUser` trusts a client-supplied `x-user-email` header with no signature, secret, or session — any caller can act as any user by setting the header. Because there is no cookie-based session, classic CSRF is not exploitable, which is why ZAP's *Absence of Anti-CSRF Tokens* passed; but the same property means the auth model is effectively "identity assertion", not authentication. The `JWT_SECRET` env var is read by `config/production.js` but no JWT is ever issued or verified.
5. **Content-Security-Policy weaknesses (ZAP Medium ×3).** Helmet's CSP allows `'unsafe-inline'` for `script-src` and `style-src`, and several fetch directives have no fallback. This weakens XSS defence-in-depth for the SPA.

Positive observations: all sqlite3 queries in `backend/src` are parameterised and scoped by `user_email` (Semgrep found no SQL-injection or path-traversal findings); the export routes parse `clientId` with `parseInt` and only use it in a parameterised query, so there is no filesystem path traversal in the CSV/PDF export; `helmet`, `cors` and `express-rate-limit` are enabled (the rate limiter tripped during the scan); ZAP passed 61/61 baseline rules apart from the header warnings listed below.

---

## 2. npm audit — `frontend/`

Command: `cd frontend && npm ci && npm audit --json` → [`artifacts/npm-audit-frontend.json`](./artifacts/npm-audit-frontend.json)

| Severity | Count |
|---|---|
| critical | 0 |
| high | 14 |
| moderate | 5 |
| low | 1 |
| info | 0 |
| **total** | **20** |

### High/critical findings

| Package | Vulnerable range | Advisory (title + URL) | Path | Fixed in | Resolution |
|---|---|---|---|---|---|
| `axios` | 1.0.0 – 1.17.0 (installed 1.13.2) | 29 advisories, e.g. NO_PROXY bypass → SSRF [GHSA-3p68-rc4w-qgx5](https://github.com/advisories/GHSA-3p68-rc4w-qgx5); Auth bypass via prototype pollution in `validateStatus` [GHSA-w9j2-pvgh-6h63](https://github.com/advisories/GHSA-w9j2-pvgh-6h63); MITM via `config.proxy` gadget [GHSA-35jp-ww65-95wh](https://github.com/advisories/GHSA-35jp-ww65-95wh); Proxy-Authorization leak on redirect [GHSA-p92q-9vqr-4j8v](https://github.com/advisories/GHSA-p92q-9vqr-4j8v); formToJSON recursion DoS [GHSA-42h9-826w-cgv3](https://github.com/advisories/GHSA-42h9-826w-cgv3) | **direct** (runtime) | ≥1.18.0 | `npm audit fix` (semver-compatible) |
| `react-router-dom` | 7.0.0-pre.0 – 7.11.0 (installed 7.10.0) | via `react-router` (below) | **direct** (runtime) | ≥7.17.1 | `npm audit fix` |
| `react-router` | 6.0.0 – 7.17.0 | XSS via open redirects [GHSA-2w69-qvjg-hvjx](https://github.com/advisories/GHSA-2w69-qvjg-hvjx); turbo-stream deserialization → unauth RCE (SSR/RSC only) [GHSA-49rj-9fvp-4h2h](https://github.com/advisories/GHSA-49rj-9fvp-4h2h); XSS via `javascript:` RSC redirect [GHSA-8646-j5j9-6r62](https://github.com/advisories/GHSA-8646-j5j9-6r62); DoS via `__manifest` [GHSA-8x6r-g9mw-2r78](https://github.com/advisories/GHSA-8x6r-g9mw-2r78); CSRF in action processing [GHSA-h5cw-625j-3rxh](https://github.com/advisories/GHSA-h5cw-625j-3rxh) | transitive ← `react-router-dom` | ≥7.17.1 | `npm audit fix` |
| `vite` | 7.0.0 – 7.3.3 (installed 7.2.6) | Path traversal in optimized deps `.map` [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9); `server.fs.deny` bypass [GHSA-v2wj-q39q-566r](https://github.com/advisories/GHSA-v2wj-q39q-566r); arbitrary file read via dev-server WebSocket [GHSA-p9ff-h696-f583](https://github.com/advisories/GHSA-p9ff-h696-f583); launch-editor NTLM hash disclosure [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | **direct** (dev/build) | ≥7.3.5 | `npm audit fix` |
| `rollup` | 4.0.0 – 4.58.0 | Arbitrary file write via path traversal [GHSA-mw96-cpmx-2vgc](https://github.com/advisories/GHSA-mw96-cpmx-2vgc) | transitive ← `vite` | ≥4.59.0 | `npm audit fix` |
| `postcss` | ≤8.5.22 | XSS via unescaped `</style>` [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93); arbitrary file read via `sourceMappingURL` [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q) | transitive ← `vite` | >8.5.22 | `npm audit fix` |
| `nanoid` | ≤3.3.17 | Infinite loop / integer overflow [GHSA-28wg-ghj8-5hjv](https://github.com/advisories/GHSA-28wg-ghj8-5hjv), [GHSA-xwg4-73v4-xw9w](https://github.com/advisories/GHSA-xwg4-73v4-xw9w) | transitive ← `vite` | >3.3.17 | `npm audit fix` |
| `picomatch` | 4.0.0 – 4.0.3 | Method injection in POSIX classes [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p); ReDoS via extglob [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | transitive ← `vite` | ≥4.0.4 | `npm audit fix` |
| `form-data` | 4.0.0 – 4.0.5 | CRLF injection in multipart names [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | transitive ← `axios` | ≥4.0.6 | `npm audit fix` |
| `browserslist` | ≤4.28.6 | Unbounded memory growth [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx); crash via custom stats [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | transitive ← `@vitejs/plugin-react` | >4.28.6 | `npm audit fix` |
| `js-yaml` | 4.0.0 – 4.3.1 | Quadratic DoS in merge keys [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), [GHSA-52cp-r559-cp3m](https://github.com/advisories/GHSA-52cp-r559-cp3m) | transitive ← `eslint` | ≥4.3.2 | `npm audit fix` |
| `flatted` | ≤3.4.1 | Unbounded recursion DoS [GHSA-25h7-pfq9-p65f](https://github.com/advisories/GHSA-25h7-pfq9-p65f); prototype pollution [GHSA-rf6f-7fwh-wjgh](https://github.com/advisories/GHSA-rf6f-7fwh-wjgh) | transitive ← `eslint` | >3.4.1 | `npm audit fix` |
| `minimatch` | ≤3.1.3 ‖ 9.0.0 – 9.0.6 | ReDoS ×3 [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | transitive ← `eslint`, `typescript-eslint` | ≥3.1.4 / ≥9.0.7 | `npm audit fix` |
| `brace-expansion` | ≤1.1.17 ‖ 2.0.0 – 2.1.3 | DoS ×4 e.g. [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v), [GHSA-3jxr-9vmj-r5cp](https://github.com/advisories/GHSA-3jxr-9vmj-r5cp) | transitive ← `eslint`, `typescript-eslint` | ≥1.1.18 / ≥2.1.4 | `npm audit fix` |

Moderate/low (all fixable via `npm audit fix`): `@babel/core` (low), `@humanfs/node`, `ajv`, `baseline-browser-mapping`, `follow-redirects` (← `axios`, runtime), `yaml`.

Only `axios` and `react-router-dom` ship to the browser; everything else is build/lint tooling. **All 20 frontend findings are resolvable with a non-breaking `npm audit fix`.**

---

## 3. npm audit — `backend/`

Command: `cd backend && npm ci && npm audit --json` → [`artifacts/npm-audit-backend.json`](./artifacts/npm-audit-backend.json)

| Severity | Count |
|---|---|
| critical | 1 |
| high | 13 |
| moderate | 6 |
| low | 3 |
| info | 0 |
| **total** | **23** |

### High/critical findings

| Package | Vulnerable range | Advisory (title + URL) | Path | Fixed in | Resolution |
|---|---|---|---|---|---|
| `tar` | ≤7.5.20 | **CRITICAL** — arbitrary file overwrite via hardlink path traversal [GHSA-34x7-hfp2-rc4v](https://github.com/advisories/GHSA-34x7-hfp2-rc4v); symlink poisoning [GHSA-8qq5-rm4j-mr97](https://github.com/advisories/GHSA-8qq5-rm4j-mr97); hardlink escape via symlink chain [GHSA-83g3-92jg-28cx](https://github.com/advisories/GHSA-83g3-92jg-28cx); +9 more DoS/parsing advisories | transitive ← `sqlite3` → `node-gyp` | >7.5.20 | **manual major bump** to `sqlite3@6.0.1` (`npm audit fix --force`) |
| `sqlite3` | 5.0.0 – 5.1.7 (installed 5.1.7) | via `node-gyp`, `tar` | **direct** (runtime, native build) | 6.0.1 | **manual major bump** |
| `node-gyp` | ≤10.3.1 | via `make-fetch-happen`, `tar` | transitive ← `sqlite3` | — | major bump of `sqlite3` |
| `make-fetch-happen` | 7.1.1 – 14.0.0 | via `cacache`, `http-proxy-agent` | transitive ← `sqlite3` → `node-gyp` | — | major bump of `sqlite3` |
| `cacache` | 14.0.0 – 18.0.4 | via `tar` | transitive ← `sqlite3` → `node-gyp` | — | major bump of `sqlite3` |
| `ip-address` | ≤10.3.0 | XSS in Address6 HTML methods [GHSA-v2v4-37r5-5v8g](https://github.com/advisories/GHSA-v2v4-37r5-5v8g); octal/decimal confusion → SSRF [GHSA-mwp4-54f8-5fhr](https://github.com/advisories/GHSA-mwp4-54f8-5fhr) | transitive ← `sqlite3` (socks) | >10.3.0 | `npm audit fix` |
| `path-to-regexp` | <0.1.13 | ReDoS via multiple route parameters [GHSA-37ch-88jc-xwx2](https://github.com/advisories/GHSA-37ch-88jc-xwx2) | transitive ← `express@4.22.1` (**runtime request path**) | ≥0.1.13 | `npm audit fix` |
| `jws` | <3.2.3 | Improper HMAC signature verification [GHSA-869p-cjfg-cm3x](https://github.com/advisories/GHSA-869p-cjfg-cm3x) | transitive ← `jsonwebtoken@9.0.2` (declared, unused at runtime) | ≥3.2.3 | `npm audit fix` |
| `form-data` | 4.0.0 – 4.0.5 | CRLF injection [GHSA-hmw2-7cc7-3qxx](https://github.com/advisories/GHSA-hmw2-7cc7-3qxx) | transitive ← `supertest` (dev) | ≥4.0.6 | `npm audit fix` |
| `js-yaml` | ≤3.15.1 | Quadratic DoS ×4, e.g. [GHSA-h67p-54hq-rp68](https://github.com/advisories/GHSA-h67p-54hq-rp68), [GHSA-5p4m-2wfm-xmqj](https://github.com/advisories/GHSA-5p4m-2wfm-xmqj) | transitive ← `jest` (dev) | ≥3.15.2 | `npm audit fix` |
| `picomatch` | ≤2.3.1 | Method injection [GHSA-3v7f-55p6-f55p](https://github.com/advisories/GHSA-3v7f-55p6-f55p); ReDoS [GHSA-c2c7-rcm5-vvqj](https://github.com/advisories/GHSA-c2c7-rcm5-vvqj) | transitive ← `jest`, `nodemon` (dev) | ≥2.3.2 | `npm audit fix` |
| `minimatch` | ≤3.1.3 | ReDoS ×3 [GHSA-3ppc-4f35-3m26](https://github.com/advisories/GHSA-3ppc-4f35-3m26), [GHSA-7r86-cg39-jmmj](https://github.com/advisories/GHSA-7r86-cg39-jmmj), [GHSA-23c5-xmqv-rm74](https://github.com/advisories/GHSA-23c5-xmqv-rm74) | transitive ← `jest`, `nodemon`, `sqlite3` | ≥3.1.4 | `npm audit fix` |
| `brace-expansion` | ≤1.1.17 | DoS ×4, e.g. [GHSA-f886-m6hf-6m8v](https://github.com/advisories/GHSA-f886-m6hf-6m8v), [GHSA-rgw5-rvv9-x895](https://github.com/advisories/GHSA-rgw5-rvv9-x895) | transitive ← `nodemon` (dev) | ≥1.1.18 | `npm audit fix` |
| `browserslist` | ≤4.28.6 | OOM [GHSA-c83g-rgw3-j3cx](https://github.com/advisories/GHSA-c83g-rgw3-j3cx); crash via stats [GHSA-73wf-gq98-2v4g](https://github.com/advisories/GHSA-73wf-gq98-2v4g) | transitive ← `jest` (dev) | >4.28.6 | `npm audit fix` |

### Moderate/low findings (runtime-relevant ones in bold)

| Package | Severity | Advisory | Path | Resolution |
|---|---|---|---|---|
| **`express`** 4.10.0 – 4.22.2 | moderate | via `qs` | direct (runtime) | `npm audit fix` |
| **`qs`** ≤6.15.3 | moderate | arrayLimit bypass DoS [GHSA-w7fw-mjwx-w883](https://github.com/advisories/GHSA-w7fw-mjwx-w883), [GHSA-6rw7-vpxm-498p](https://github.com/advisories/GHSA-6rw7-vpxm-498p), attacker-controlled isBuffer DoS [GHSA-4mjr-xmp4-gh2g](https://github.com/advisories/GHSA-4mjr-xmp4-gh2g) | ← `express`, `body-parser` | `npm audit fix` |
| **`body-parser`** ≤1.20.6 | moderate | DoS when invalid limit silently disables enforcement [GHSA-v422-hmwv-36x6](https://github.com/advisories/GHSA-v422-hmwv-36x6) | ← `express` | `npm audit fix` |
| **`joi`** ≤17.13.5 | moderate | RangeError on deep input [GHSA-q7cg-457f-vx79](https://github.com/advisories/GHSA-q7cg-457f-vx79); prototype pollution via `__proto__` message key [GHSA-6w3j-5fw6-r9vr](https://github.com/advisories/GHSA-6w3j-5fw6-r9vr); `rename()` prototype set [GHSA-gg4h-3hg2-grpc](https://github.com/advisories/GHSA-gg4h-3hg2-grpc) | direct (runtime, request validation) | `npm audit fix` |
| **`morgan`** ≤1.11.0 | moderate | Log forging via control chars / Unicode separators [GHSA-4vj7-5mj6-jm8m](https://github.com/advisories/GHSA-4vj7-5mj6-jm8m), [GHSA-jxfw-x594-9x9m](https://github.com/advisories/GHSA-jxfw-x594-9x9m) | direct (runtime) | `npm audit fix` |
| `baseline-browser-mapping` | moderate | DoS [GHSA-w5vr-8v7q-w6rv](https://github.com/advisories/GHSA-w5vr-8v7q-w6rv) | ← jest | `npm audit fix` |
| `@babel/core` | low | arbitrary file read via sourceMappingURL [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) | ← jest | `npm audit fix` |
| `@tootallnate/once`, `http-proxy-agent` | low | control-flow scoping [GHSA-vpq2-c234-7xj6](https://github.com/advisories/GHSA-vpq2-c234-7xj6) | ← sqlite3 → node-gyp | major bump of `sqlite3` |

Summary: 17 of 23 backend findings are resolvable with `npm audit fix`; the 6 in the `sqlite3 → node-gyp → tar` chain (incl. the only **critical**) require `sqlite3@6.x`. `pdfkit` had no advisories.

---

## 4. Semgrep (SAST)

Command (Semgrep 1.177.0, pip-installed):

```
semgrep scan --config p/default --config p/owasp-top-ten --config p/javascript --config p/typescript \
  --config p/nodejs --config p/expressjs --config p/react \
  --exclude node_modules --exclude dist --exclude build --exclude coverage \
  --json --output docs/security/artifacts/semgrep-results.json backend/src frontend/src
```

Result: 216 rules run on 36 files (20 JS, 13 TS/TSX, ~100% lines parsed), **5 findings, 0 errors** → [`artifacts/semgrep-results.json`](./artifacts/semgrep-results.json)

| Severity | Count |
|---|---|
| ERROR | 0 |
| WARNING | 0 |
| INFO | 5 |

| # | Severity | Rule ID | File:line | Message | Remediation note |
|---|---|---|---|---|---|
| 1 | INFO | `javascript.express.security.audit.express-check-csurf-middleware-usage` | `backend/src/server.js:15` | A CSRF middleware was not detected in your express application. | The API is authenticated purely via a custom `x-user-email` request header and has no cookies/sessions, so browser-forged cross-site requests cannot carry the header (CORS preflight blocks it). CSRF middleware is therefore not strictly required, but document this as a deliberate decision, and revisit if cookie-based auth is ever introduced. The real weakness is that the header is unauthenticated (see below). |
| 2 | INFO | same rule | `backend/src/__tests__/routes/auth.test.js:8` | same | Test harness creates its own `express()` app; no action beyond #1. |
| 3 | INFO | same rule | `backend/src/__tests__/routes/clients.test.js:14` | same | as above |
| 4 | INFO | same rule | `backend/src/__tests__/routes/reports.test.js:37` | same | as above |
| 5 | INFO | same rule | `backend/src/__tests__/routes/workEntries.test.js:14` | same | as above |

### Targeted review of the requested hotspots (manual, informed by Semgrep coverage)

| Area | Result |
|---|---|
| SQL injection in raw `sqlite3` queries | **No findings.** Every `db.get/all/run` call in `backend/src/routes/*.js`, `middleware/auth.js`, and `database/init.js` uses `?` placeholders and passes a parameter array; user input is never concatenated into SQL. Semgrep's `javascript.sequelize`/`node-sqli` style rules in `p/nodejs`/`p/owasp-top-ten` did not fire. |
| `x-user-email` / JWT auth model (`backend/src/middleware/auth.js`) | **Design weakness, not a rule match.** `authenticateUser` accepts any syntactically valid email in `x-user-email`, auto-creates the user, and scopes all data by it. There is no secret, signature, or session: identity is fully client-asserted, so any user can read/modify another tenant's data by changing the header. `jsonwebtoken` is in `package.json` and `JWT_SECRET` is read in `config/production.js`, but **no JWT is ever signed or verified** anywhere in `backend/src`. Recommend issuing a signed token on `/api/auth/login` and verifying it in the middleware (or an external IdP). |
| Path traversal in PDF/CSV export (`backend/src/routes/reports.js`) | **No findings.** `/export/csv/:clientId` and `/export/pdf/:clientId` coerce the param with `parseInt`, reject `NaN`, and stream generated content directly to the response; no filesystem path is built from user input. `Content-Disposition` filenames are built from `client.name` — worth ensuring the name is sanitised of quotes/CRLF (Joi limits it to a trimmed ≤255-char string but does not strip `"`, `;` or newlines). |

---

## 5. OWASP ZAP (DAST)

App under test: `docker build -f docker/Dockerfile -t timesheet-app .` → `docker run -d -p 3001:3001 -e JWT_SECRET=ci-test-secret timesheet-app`; `/health` returned 200 before scanning.

Two scans were run with the official `ghcr.io/zaproxy/zaproxy:stable` image (ZAP 2.17.0):

| Scan | Script | Type | Auth |
|---|---|---|---|
| A | `zap-baseline.py -t http://localhost:3001` | Spider (1 min) + **passive** scan of the SPA and static assets | Replacer rule injecting `x-user-email: zap-scanner@example.com` on every request |
| B | `zap-api-scan.py -t openapi.yaml -f openapi` | Import of a hand-written OpenAPI 3.0 spec ([`artifacts/openapi.yaml`](./artifacts/openapi.yaml)) covering all 17 route/method pairs under `/api/auth`, `/api/clients`, `/api/work-entries`, `/api/reports`, then **active** scan with the API policy | Same replacer rule |

The header injection worked: the container log shows `GET /api/auth/me → 200` and authenticated 2xx responses for `/api/work-entries`, `/api/reports/client/1`, etc. Test data (`POST /api/clients`, `POST /api/work-entries`) was seeded under the same identity before scan B.

**Endpoints only reachable unauthenticated / not fully exercised:** none were blocked by auth. However, `GET /api/clients` and `GET /api/clients/:id` returned **500** for every request in the container (see finding B-1), so ZAP could only exercise their error path. The express-rate-limit middleware also throttled part of the active scan (`429 Too many requests`), which limits payload coverage — for a deeper active scan, raise the limit in a test build.

Reports: [`zap-baseline.html`](./artifacts/zap-baseline.html) / [`zap-baseline.json`](./artifacts/zap-baseline.json), [`zap-api.html`](./artifacts/zap-api.html) / [`zap-api.json`](./artifacts/zap-api.json), generated Automation Framework plan [`zap-baseline-plan.yaml`](./artifacts/zap-baseline-plan.yaml).

### Scan A — baseline (passive): FAIL 0 · WARN 6 rule groups (9 alert types) · PASS 61

| Risk | Alert | Affected URL(s) | Remediation summary |
|---|---|---|---|
| Medium | CSP: `script-src unsafe-inline` (10055) | `/`, `/robots.txt`, `/sitemap.xml` | Remove `'unsafe-inline'` from `script-src` in the Helmet CSP config (`docker/overrides/server.js`); Vite production builds do not need inline scripts. Use nonces/hashes if any inline script is required. |
| Medium | CSP: `style-src unsafe-inline` (10055) | same | MUI/Emotion injects inline styles; use Emotion's nonce support (`CacheProvider` with `nonce`) and drop `'unsafe-inline'` from `style-src`. |
| Medium | CSP: Failure to Define Directive with No Fallback (10055) | same | Add explicit `form-action`, `frame-ancestors`, `base-uri` (these do not inherit from `default-src`). |
| Low | Cross-Origin-Embedder-Policy header missing/invalid (90004) | `/`, `/robots.txt`, `/sitemap.xml` | Set `Cross-Origin-Embedder-Policy: require-corp` via Helmet (`crossOriginEmbedderPolicy: true`). |
| Low | Cross-Origin-Opener-Policy header missing/invalid (90004) | same | Set `Cross-Origin-Opener-Policy: same-origin` (Helmet default; currently disabled/overridden). |
| Low | Permissions Policy Header Not Set (10063) | `/`, `/assets/index-*.js`, `/robots.txt`, `/sitemap.xml` | Add `Permissions-Policy: camera=(), microphone=(), geolocation=()` etc. |
| Low | Timestamp Disclosure – Unix (10096) | `/assets/index-*.js` | Informational; a numeric constant in the bundle looks like a Unix timestamp. Verify it is not a build secret; otherwise ignore. |
| Informational | Modern Web Application (10109) | `/`, `/robots.txt`, `/sitemap.xml` | Informational — SPA detected (the SPA fallback serves `index.html` for unknown paths such as `/robots.txt`, which is why those URLs appear). Consider serving a real `robots.txt` or 404 for non-app paths. |
| Informational | Storable but Non-Cacheable Content (10049) | `/`, `/assets/index-*.css`, `/vite.svg`, `/robots.txt`, `/sitemap.xml` | Add explicit `Cache-Control` (long `max-age, immutable` for hashed assets; `no-store` for `index.html`). |

### Scan B — API scan (active, authenticated): FAIL 0 · WARN 4 · PASS 116

| # | Risk | Alert | Affected URL(s) | Remediation summary |
|---|---|---|---|---|
| B-1 | Low (High confidence) | A Server Error response code was returned by the server (100000) ×3 | `GET /api/clients`, `GET /api/clients/1`, `GET /api/clients/<fuzz>` | Root cause: `docker/overrides/database/init.js` omits the `department` column that `routes/clients.js` selects (`SQLITE_ERROR: no such column: department`). Align the Docker DB schema with `backend/src/database/init.js` (or add a migration). Until fixed the containerised app cannot list clients. |
| B-2 | Low | Application Error Disclosure (90022) ×2 | `GET /api/clients`, `GET /api/clients/1` | Same root cause; the 500 body is a generic `{"error":"Internal server error"}`, so disclosure is minimal, but the stack is logged with `console.error`. Fix schema; ensure error handler never leaks details in production. |
| B-3 | Low | Information Disclosure – Debug Error Messages (10023) ×2 | same | as B-2 |
| B-4 | Low (High confidence) | Unexpected Content-Type was returned (100001) ×59 | `/`, `/api/<random>`, `/api/auth/<random>`, … | Unknown paths under `/api/*` fall through to the SPA `index.html` (text/html, 200) instead of a JSON 404. Add a JSON 404 handler for `/api/*` before the static fallback, so API clients and scanners get `404 application/json`. |
| — | Informational | A Client Error response code was returned by the server (100000) ×65 | many `/api/*` fuzzed URLs | Expected 4xx (400 Joi validation, 404 not found, 429 rate-limit). No action. |
| — | Informational | Non-Storable Content (10049) ×5 | `/api/auth/login`, `/api/clients`, `/api/clients/1`, … | Expected for dynamic API responses. No action. |
| — | Informational | Storable and Cacheable Content (10049) ×5 | `/api/auth/me`, `/api/work-entries*`, `/api/reports/client/1*` | Authenticated JSON should not be cacheable by shared caches: send `Cache-Control: no-store` on `/api/*`. |

No High-risk alerts, and no injection (SQLi, XSS, command injection, path traversal) alerts were raised by the active scan against any API endpoint. ZAP's *Absence of Anti-CSRF Tokens*, *Weak Authentication Method*, *Cross-Domain Misconfiguration*, *X-Powered-By*, *Anti-clickjacking*, *X-Content-Type-Options*, *HSTS* and *Vulnerable JS Library (Retire.js)* rules all **passed** (the last one because the vulnerable `axios`/`react-router` versions are bundled and not fingerprinted by Retire.js — the SCA results in §2 remain authoritative).

---

## 6. Environment details

| Item | Value |
|---|---|
| Host | Devin cloud VM, Ubuntu Linux, Docker 29.7.2 |
| Node.js / npm | v20.20.2 / 10.8.2 (host); `node:20-alpine` inside the app image |
| npm audit | `npm audit --json` after `npm ci`, in `frontend/` and `backend/` (dev + prod deps), advisory source: GitHub Advisory Database via registry.npmjs.org |
| Semgrep | 1.177.0 (`pip install semgrep`), rulesets `p/default`, `p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/nodejs`, `p/expressjs`, `p/react` (216 rules resolved), excludes `node_modules`, `dist`, `build`, `coverage`, no `SEMGREP_APP_TOKEN` |
| OWASP ZAP | `ghcr.io/zaproxy/zaproxy:stable` (ZAP 2.17.0, Java 17). Scan A: `zap-baseline.py` (spider + passive). Scan B: `zap-api-scan.py -f openapi` (import + active scan, API scan policy) with a hand-written OpenAPI 3.0 spec |
| ZAP authentication | Configured via `replacer.full_list(0)` (REQ_HEADER, `x-user-email` → `zap-scanner@example.com`) passed with `-z`; verified authenticated 200s in container logs. No JWT was configured because the backend never verifies one |
| App under test | `docker/Dockerfile` production image, `JWT_SECRET=ci-test-secret`, `http://localhost:3001`, `/health` = 200 |
| NVD API key | **Not required by any tool** (npm audit, Semgrep, ZAP) |

## 7. Artifacts

| File | Description |
|---|---|
| `artifacts/npm-audit-frontend.json` | Raw `npm audit --json`, frontend |
| `artifacts/npm-audit-backend.json` | Raw `npm audit --json`, backend |
| `artifacts/semgrep-results.json` | Raw Semgrep JSON |
| `artifacts/zap-baseline.json` / `.html` | ZAP baseline (passive) report |
| `artifacts/zap-api.json` / `.html` | ZAP API scan (active, authenticated) report |
| `artifacts/openapi.yaml` | OpenAPI spec used to drive the ZAP API scan |
| `artifacts/zap-baseline-plan.yaml` | Automation Framework plan generated by `zap-baseline.py` |
