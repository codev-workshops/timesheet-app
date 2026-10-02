# Timesheet App — Incident Runbook

Operational runbook for the timesheet-app backend (Node.js/Express, port 3001, SQLite).

## Quick reference

| Item | Value |
|---|---|
| Service | Express API on port `3001` |
| Database (dev) | SQLite `:memory:` singleton (`backend/src/database/init.js`) |
| Database (prod) | File-based SQLite at `DATABASE_PATH` (default `/app/data/timesheet.db` inside the container) |
| Health check | `GET /health` — deep check; returns `200 { db: 'up' }` or `503 { db: 'down' }` |
| Metrics | `GET /metrics` — Prometheus exposition format (no auth, not rate-limited) |
| Auth | `x-user-email` header checked in `backend/src/middleware/auth.js` (no JWT) |
| Rate limit | `express-rate-limit`, 100 req / 15 min / IP; `/health` and `/metrics` are exempt |
| Logs | `morgan` (combined) request log + `console` output; `docker logs <container>` in prod |
| Container | `docker/Dockerfile`, `nodejs` user (uid 1001), `HEALTHCHECK` hits `/health` every 30s |
| Orchestration | `docker-compose.yml` at repo root — `restart: unless-stopped`, `timesheet-data` volume on `/app/data` |
| Backup | `cd backend && DATABASE_PATH=/app/data/timesheet.db node scripts/backup.js` |

## Monitoring

`GET /metrics` exposes Prometheus metrics. Point a scraper at it and alert on:

| Metric | Type | Alert condition |
|---|---|---|
| `up` | gauge (scraper) | `up == 0` → process/container down |
| `process_uptime_seconds` | gauge | drops to ~0 repeatedly → crash loop |
| `process_start_time_seconds` | gauge (default metrics) | recent reset → unexpected restart |
| `http_request_duration_seconds` | histogram (method, route, status_code) | p95 > 10s on `/api/reports/*` → export timeouts |
| `db_errors_total` | counter (code label, e.g. `SQLITE_BUSY`) | rate > 0 → DB errors reaching clients |
| `db_rows` | gauge (table: `users`, `clients`, `work_entries`) | sudden drop vs previous scrape → data loss |
| `db_file_exists` | gauge | `== 0` when `DATABASE_PATH` set → DB file deleted |
| `db_file_size_bytes` | gauge | shrinking or zero → data loss / corruption |
| `process_resident_memory_bytes` | gauge (default metrics) | sustained growth → memory leak / OOM risk |

Container logs: `docker logs timesheet-app` (or your orchestrator's log driver). Look for `Failed to start server:`, `Received SIGTERM`, `Uncaught exception:`, `Unhandled promise rejection:`.

## Severity levels

| Severity | Meaning | Response | Mitigate | Resolve | Examples |
|---|---|---|---|---|---|
| SEV-1 | Service down or data loss | 15 min | 1 h | 4 h | DB reset, crash loop |
| SEV-2 | Degraded for many users | 30 min | 2 h | 8 h | SQLITE_BUSY, OOM, disk full, mass 401 |
| SEV-3 | Limited impact / single feature | 4 h | 1 day | 1 week | Export timeouts, rate-limit lockout |

When filing an incident, use `.github/ISSUE_TEMPLATE/incident_report.yml` (or `data_loss.yml` for SEV-1 data loss).

---

## SEV-1: Data loss / database reset

**Symptoms**
- Users report empty dashboards, missing clients, or missing work entries.
- `db_rows` gauge drops sharply between scrapes; `db_file_exists` = 0 or `db_file_size_bytes` shrank.
- After a restart, previously saved data is gone.

**Detection**
- `db_rows{table="users"}` / `db_rows{table="work_entries"}` alert on sudden decrease.
- `db_file_exists == 0` or `db_file_size_bytes` decrease alert.
- Container recreated without the `timesheet-data` volume attached (`/app/data` is container-local).

**Severity:** SEV-1 — data loss.

**Recovery**

1. Confirm the scope: `curl -s localhost:3001/metrics | grep -E 'db_rows|db_file'` and check whether `DATABASE_PATH` points where expected.
2. If the DB file is intact but the app crashed, restart the app and verify `curl -s localhost:3001/health` returns `db: "up"`.
3. If the file is gone or empty, stop the app (prevents new writes), then restore `timesheet.db` from the latest backup or volume snapshot into `DATABASE_PATH`:
   ```bash
   docker cp backup.db timesheet-app:/app/data/timesheet.db
   docker restart timesheet-app
   ```
4. Verify row counts against the backup:
   ```bash
   sqlite3 /app/data/timesheet.db "SELECT COUNT(*) FROM users; SELECT COUNT(*) FROM work_entries;"
   ```
   and confirm `db_rows` at `/metrics` matches.
5. Communicate the data-loss window to stakeholders: last good backup timestamp → incident detection time.
6. File a `data_loss` issue (`.github/ISSUE_TEMPLATE/data_loss.yml`).

**Prevention / follow-ups**
- Always mount `timesheet-data` on `/app/data` (see `docker-compose.yml`). Never run prod without it.
- Schedule `backend/scripts/backup.js` (e.g. cron inside or alongside the container) and ship backups off-box.
- Note: the dev profile uses `:memory:` — every restart wipes it by design. Do not use the dev profile for real data.

## SEV-1: Process crash / startup failure

**Symptoms**
- Container restarts repeatedly or exits; `up == 0`; `process_uptime_seconds` keeps resetting to ~0.
- `GET /health` connection refused (not 503 — process is gone entirely).

**Detection**
- `up == 0` alert or `process_uptime_seconds` reset alert.
- Docker: `docker ps` shows `Restarting` or repeated restarts; `docker inspect` restart count growing.
- Logs show `Failed to start server:` followed by the underlying error.

**Severity:** SEV-1 — service down.

**Recovery**

1. `docker logs timesheet-app --tail 200` — look for `Failed to start server:`, `Uncaught exception:`, `Unhandled promise rejection:`, or `Received SIGTERM` (distinguishes crash from orchestrator shutdown).
2. If `Error opening database:` or `EACCES`/`EROFS`: verify `DATABASE_PATH` directory exists and is writable by the `nodejs` user (uid 1001): `docker exec -u 0 timesheet-app ls -ld /app/data`.
3. Verify env vars: `PORT` (must be 3001 to match HEALTHCHECK), `FRONTEND_URL`, `DATABASE_PATH`.
4. Fix the cause, or roll back to the last known-good image tag and redeploy.
5. Confirm recovery: `curl -s localhost:3001/health` → `200`, `process_uptime_seconds` climbing.

**Prevention / follow-ups**
- `docker-compose.yml` sets `restart: unless-stopped` so the orchestrator auto-restarts a crashed container.
- Startup logs now print `DATABASE_PATH` and DB type (`memory` vs `file`) — a `type=memory` line in prod means misconfiguration.
- Alert on `up == 0` and on `process_uptime_seconds < 60` firing repeatedly.

## SEV-2: SQLite lock errors (SQLITE_BUSY)

**Symptoms**
- Intermittent or sustained `500 { error: 'Database error' }` responses.
- `db_errors_total{code="SQLITE_BUSY"}` increasing.
- Writes fail while a long read or another write holds the single shared connection.

**Detection**
- `db_errors_total` counter with `code="SQLITE_BUSY"` label.
- Logs: `Database error:` entries with `SQLITE_BUSY`; `errorHandler` maps them to generic 500s.
- `http_request_duration_seconds{status_code="500"}` rising.

**Severity:** SEV-2 — degraded.

**Recovery**

1. Grep logs for the query that ran when errors started — find the blocking statement.
2. If a single request wedged the connection, restart the process/container to release the lock: `docker restart timesheet-app`.
3. Verify: `db_errors_total` stops increasing; `/health` returns `db: "up"`.

**Prevention / follow-ups**
- Set `PRAGMA busy_timeout` and enable WAL mode (`PRAGMA journal_mode=WAL`) in `init.js` (out of scope of current observability work — track as a fix task).
- Reduce long-held transactions in `reports.js` export paths.

## SEV-2: OOM / memory growth

**Symptoms**
- Container killed (exit 137 / OOMKilled) or node heap crashes (`JavaScript heap out of memory`).
- `process_resident_memory_bytes` grows monotonically; `process_uptime_seconds` resets after each kill.
- Large PDF exports (`/api/reports/export/pdf/*`) or big `db.all` result sets precede the crash.

**Detection**
- `process_resident_memory_bytes` trend and container restart count (`docker inspect --format '{{.RestartCount}}'`).
- `docker inspect` shows `OOMKilled: true`.
- Logs: V8 heap allocation failures before exit.

**Severity:** SEV-2 — degraded with restarts.

**Recovery**

1. Check restart counts and `OOMKilled` status.
2. Restart the process/container to reclaim memory.
3. If recurring, capture a heap snapshot (`node --heapsnapshot-signal` or `node --inspect` + Chrome DevTools) to identify the growth source — known suspects: PDFKit buffered documents, unbounded `db.all` result sets.

**Prevention / follow-ups**
- Set `NODE_OPTIONS=--max-old-space-size=<mb>` sized to the container limit.
- Add pagination/streaming for `db.all` queries and PDF generation (tracked as a fix task, not yet implemented).

## SEV-2: Disk exhaustion

**Symptoms**
- Writes fail with `SQLITE_FULL` (`db_errors_total{code="SQLITE_FULL"}` up).
- `ENOSPC` in logs; exports fail creating temp CSVs; container disk full.

**Detection**
- `db_errors_total{code="SQLITE_FULL"}`.
- `du -sh backend/temp/` on the host, or `docker exec timesheet-app du -sh /app` for temp files and logs.

**Severity:** SEV-2 — degraded; writes blocked.

**Recovery**

1. `du -sh` on `backend/temp/` and log directories; `df -h` for the volume.
2. Delete orphaned `*_report_*.csv` files in `temp/` (files surviving a crashed request are not cleaned up).
3. Rotate/compress logs; truncate container logs if using the `json-file` driver (`truncate -s 0 $(docker inspect --format '{{.LogPath}}' timesheet-app)`).
4. Confirm free space and that `db_errors_total{code="SQLITE_FULL"}` stopped.

**Prevention / follow-ups**
- Fix cleanup-on-error in `routes/reports.js` (temp CSVs are deleted only on the success path).
- Configure Docker log rotation (`max-size`, `max-file`) on the container or compose service.
- Alert on disk usage of the `timesheet-data` volume.

## SEV-2: Mass 401 / auth failures

**Symptoms**
- All users redirected to `/login`; API returns `401 { error: 'User email required in x-user-email header' }` for every request.
- `http_request_duration_seconds{status_code="401"}` spikes.

**Detection**
- Rate of 401s in `http_request_duration_seconds` or access logs.
- Users report being logged out simultaneously.

**Severity:** SEV-2 — effectively down for users.

**Recovery**

1. Verify the `x-user-email` header survives any proxy/ingress — dump headers at the backend (`morgan` shows requests; add a temporary log of `req.headers['x-user-email']`).
2. Check the `users` table is intact (`db_rows{table="users"}` should not have dropped; mass 401 after data loss means user lookups fail).
3. If a recent change to `middleware/auth.js` caused it, roll back that middleware.

**Prevention / follow-ups**
- Keep proxy config passing the `x-user-email` header (check header-case normalization).
- Longer term: move to real session/JWT auth (header-only auth trusts the client).

## SEV-2: Misconfiguration

**Symptoms**
- Wrong `FRONTEND_URL` → browser CORS errors; API reachable by curl but not the frontend.
- Unwritable `DATABASE_PATH` → `Failed to start server:` / `Error opening database:` at startup.
- Prod container running with `type=memory` in startup logs → data silently volatile.

**Detection**
- Startup log line `Connecting to SQLite database: DATABASE_PATH=... type=...` — verify path and type.
- CORS errors in browser console; `502`s from a proxy misroute.
- Container in restart loop.

**Severity:** SEV-2 (SEV-1 if the service never comes up).

**Recovery**

1. Compare running env (`docker exec timesheet-app env | sort`) against `.env.example` / expected values.
2. Fix env vars and restart; confirm startup logs show the expected `DATABASE_PATH` and `type=file`.
3. For CORS: set `FRONTEND_URL` to the actual frontend origin (in the prod image the SPA is served same-origin, so CORS should not normally fire).

**Prevention / follow-ups**
- Pin env config in `docker-compose.yml` / orchestrator templates; review changes like code.
- Add a startup self-check that fails fast on obviously wrong config (e.g. prod + `type=memory`).

## SEV-3: Export timeouts

**Symptoms**
- Frontend shows export failures; `/api/reports/export/*` requests exceed the frontend's 10s axios timeout.
- `http_request_duration_seconds{route="/api/reports/export/pdf/:clientId"}` p95 > 10s; other endpoints remain fast.

**Detection**
- Histogram latency on `/api/reports/*` routes vs the rest.
- `/health` still `200` — isolates it to report generation, not general outage.

**Severity:** SEV-3 — single feature degraded.

**Recovery**

1. Confirm `/health` is `200` and non-report endpoints are fast.
2. If the event loop is blocked by PDFKit rendering (all endpoints slow), restart the process.
3. Identify the report's dataset size (`db_rows{table="work_entries"}` / per-client counts).

**Prevention / follow-ups**
- Paginate report queries and stream PDFs instead of buffering.
- Raise `server.timeout` or move export generation to a background job.

## SEV-3: Rate-limit lockout

**Symptoms**
- `429 Too Many Requests` responses; clients locked out after 100 requests / 15 min per IP.
- `http_request_duration_seconds{status_code="429"}` spikes.
- Previously: health checks also counted, causing false "unhealthy" states — `/health` and `/metrics` are now exempt.

**Detection**
- 429s in access logs / `status_code="429"` label.
- Usually one source IP — often a proxy, CI, or a user with a stuck retry loop.

**Severity:** SEV-3 — single client/IP affected.

**Recovery**

1. Confirm `429` (not 500) in logs; identify the source IP.
2. Wait out the 15-minute window, or restart the process to reset the in-memory limiter.
3. If the source is a health-check or monitoring loop, confirm it's hitting the exempted `/health`/`/metrics` paths.

**Prevention / follow-ups**
- `/health` and `/metrics` are registered before `app.use(limiter)` — keep them there if routes are reordered.
- Consider per-route limits or a trusted-IP exemption if a shared NAT/proxy causes lockouts.

---

## Appendix: manual backup

```bash
# From repo root on the host (or inside the container at /app):
DATABASE_PATH=/app/data/timesheet.db node backend/scripts/backup.js
# Writes BACKUP_DIR/timesheet-<ISO timestamp>.db (default: <db dir>/backups)
```

The script checkpoints WAL and copies the DB file. Restore = copy the backup over `DATABASE_PATH` while the app is stopped, then restart and verify `db_rows`.
