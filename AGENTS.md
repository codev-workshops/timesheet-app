# timesheet-app

Multi-tenant time-tracking app: Express + SQLite backend, React 19 + MUI frontend.

- Backend: validate all request bodies with the Joi schemas in `backend/src/validation/schemas.js`; return `400` with `{ error: ... }` on validation failure.
- Every DB query must be parameterized (`?` placeholders) and scoped by `user_email` (user isolation).
- Frontend: React 19 + TypeScript + Material UI; server state goes through TanStack Query hooks only.
- Commands: test `cd backend && npm test` · lint `cd frontend && npm run lint` · build `cd frontend && npm run build`.
- Dev servers: backend `cd backend && npm run dev` (port 3001) · frontend `cd frontend && npm run dev` (port 5173).
- The backend requires `JWT_SECRET` (≥32 chars) in the environment and refuses to start without it; copy `backend/.env.example`. Auth is `Authorization: Bearer <token>` from `/api/auth/login` — never a client-supplied identity header.
- Security scanning: `npm audit` in both workspaces, and `DOCKER_CONFIG=/tmp/empty trivy fs --scanners vuln,secret,misconfig --severity HIGH,CRITICAL --skip-dirs node_modules .` (the `DOCKER_CONFIG` override avoids a `docker-credential-desktop` lookup failure on macOS). Trivy's secret rules are length-anchored and miss non-standard-format keys — pair it with gitleaks.
- For code review, use the `/review` skill. For security checks, use the `/security-audit` skill. Past remediation work is documented in `SECURITY_REMEDIATION.md`.
