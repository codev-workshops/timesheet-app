# k6 after report

Generated: 2026-09-21T13:02:06.034Z

Seed parameters: `SEED_PERF=1 SEED_USER_EMAIL=perf@example.com SEED_CLIENTS=20 SEED_ENTRIES=50000 SEED_RANDOM_SEED=42` (see `backend/scripts/seed.js`).
Load profile per script: 10s ramp to 10 VUs, 20s ramp to 50 VUs, 10s ramp to 0 (see `k6/lib.js`).
Dashboard script mode: `summary` (GET /api/reports/summary).

| Endpoint | p50 | p95 | p99 | req/s | iterations | error rate | avg payload (decoded) | avg bytes on wire / iteration | thresholds failed |
|---|---|---|---|---|---|---|---|---|---|
| GET /api/work-entries | 199.6 ms | 398.3 ms | 424.2 ms | 111.2 | 4449 | 0.00% | 10.3 KB | 2.2 KB | 0 |
| GET /api/reports/client/:id | 168.1 ms | 359.6 ms | 385.5 ms | 129.8 | 5193 | 0.00% | 399.3 KB | 24.9 KB | 0 |
| GET /api/reports/export/csv/:id | 174.2 ms | 407.9 ms | 432.0 ms | 120.4 | 4817 | 0.00% | 166.3 KB | 12.5 KB | 0 |
| Dashboard load | 526.0 ms | 1165.0 ms | 1221.6 ms | 40.9 | 1636 | 0.00% | 1.1 KB | 1.5 KB | 0 |

Raw per-script k6 output: `perf-reports/after/*.txt`, JSON: `perf-reports/after.json`.
