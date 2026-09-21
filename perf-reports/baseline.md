# k6 baseline report

Generated: 2026-09-21T12:42:29.500Z

Seed parameters: `SEED_PERF=1 SEED_USER_EMAIL=perf@example.com SEED_CLIENTS=20 SEED_ENTRIES=50000 SEED_RANDOM_SEED=42` (see `backend/scripts/seed.js`).
Load profile per script: 10s ramp to 10 VUs, 20s ramp to 50 VUs, 10s ramp to 0 (see `k6/lib.js`).
Dashboard script mode: `legacy` (GET /api/clients + GET /api/work-entries, all rows).

| Endpoint | p50 | p95 | p99 | req/s | iterations | error rate | avg payload | thresholds failed |
|---|---|---|---|---|---|---|---|---|
| GET /api/work-entries | 4428.1 ms | 13937.9 ms | 16085.2 ms | 5.4 | 237 | 0.00% | 10252.1 KB | 1 |
| GET /api/reports/client/:id | 140.4 ms | 333.8 ms | 371.9 ms | 144.5 | 5779 | 0.00% | 399.3 KB | 0 |
| GET /api/reports/export/csv/:id | 126.6 ms | 284.6 ms | 310.7 ms | 169.2 | 6770 | 0.00% | 166.3 KB | 0 |
| Dashboard load | 3565.5 ms | 20417.4 ms | 22823.9 ms | 10.0 | 235 | 0.00% | 10256.4 KB | 1 |

Raw per-script k6 output: `perf-reports/baseline/*.txt`, JSON: `perf-reports/baseline.json`.
