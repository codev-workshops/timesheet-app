# Backend load testing

## Prerequisites

- Node.js 18 or newer (Node 24 is also supported).
- [k6](https://grafana.com/docs/k6/latest/set-up/install-k6/) for the ramping scenarios.
- Dependencies installed with `npm install` from `backend/`.

## Start the server

The database is in-memory, so all data is lost when the server restarts. Seed it
again after every restart.

```sh
cd backend
DISABLE_RATE_LIMIT=true npm start
```

For the Docker image, pass the same setting:

```sh
docker run -e DISABLE_RATE_LIMIT=true ...
```

Do not enable the rate-limit bypass in production.

## Seed

From `backend/`, create one client per tier and seed entries concurrently:

```sh
npm run loadtest:seed
SEED_TIERS=200,2000 SEED_CONCURRENCY=25 npm run loadtest:seed
```

Useful variables are `BASE_URL` (default `http://localhost:3001`),
`SEED_USER_EMAIL` (default `loadtest@example.com`), `SEED_TIERS` (default
`1000,10000,50000`), and `SEED_CONCURRENCY` (default `25`). Example output:

```text
Seeding 200 entries for client 1...
  200/200 entries
┌─────────┬──────┬──────────┬─────────┬──────────┐
│ (index) │ tier │ clientId │ entries │ elapsed  │
└─────────┴──────┴──────────┴─────────┴──────────┘
SMALL_CLIENT_ID=1 MEDIUM_CLIENT_ID=2 LARGE_CLIENT_ID=3
```

Export the IDs printed by the seed command before running k6:

```sh
export SMALL_CLIENT_ID=1 MEDIUM_CLIENT_ID=2 LARGE_CLIENT_ID=3
```

The seed also writes `loadtest/seed-output.json`, which is ignored by git.

## Smoke baseline with autocannon

```sh
npm run loadtest:smoke
SMOKE_DURATION=3 npm run loadtest:smoke
```

Equivalent CLI one-liner:

```sh
npx autocannon -c 10 -d 10 -H "x-user-email=loadtest@example.com" http://localhost:3001/api/work-entries
```

Use `BASE_URL`, `SMOKE_PATH`, `SMOKE_CONNECTIONS`, `SMOKE_DURATION`, and
`USER_EMAIL` to customize the programmatic smoke test.

## Read scenario

```sh
LARGE_CLIENT_ID=3 MEDIUM_CLIENT_ID=2 npm run loadtest:read
```

Set `MAX_VUS` to override the default peak of 300 VUs. For a short validation
run, use `QUICK=1`. k6 can also save results with
`--out json=results.json`.

## Export scenario

Run the scenario three times to compare small, medium, and large clients:

```sh
EXPORT_CLIENT_ID="$SMALL_CLIENT_ID" npm run loadtest:export
EXPORT_CLIENT_ID="$MEDIUM_CLIENT_ID" npm run loadtest:export
EXPORT_CLIENT_ID="$LARGE_CLIENT_ID" npm run loadtest:export
```

`MAX_VUS` overrides the default peak of 30 VUs. Use `QUICK=1` for a short
validation run.

## Metrics to watch

- p95/p99 latency: `http_req_duration`
- Error rate: `http_req_failed`
- Event-loop lag: use `clinic doctor` or instrument
  `perf_hooks.monitorEventLoopDelay`
- RSS: `ps -o rss -p <pid>` or `top`

## Expected findings

`GET /api/work-entries` and `GET /api/reports/client/:id` use unbounded
`SELECT`s without pagination, so latency grows linearly with the dataset.
Exports load the complete result set into memory; CSV writes a temporary file
before streaming it, while PDF generation is synchronous on the event loop via
pdfkit. With one Node process and one SQLite connection, export p95 commonly
climbs sharply at low VUs (often below 10) and blocks read endpoints too.
These thresholds are starting points to tune for the deployment environment.
