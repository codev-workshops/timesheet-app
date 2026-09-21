# Baseline vs After

Generated: 2026-09-21T13:02:06.034Z

Identical seed (`SEED_CLIENTS=20 SEED_ENTRIES=50000 SEED_RANDOM_SEED=42`) and identical k6 stage profile for both runs.
The dashboard script ran in `legacy` mode for the baseline (clients + all work entries) and `summary` mode for the after run (`GET /api/reports/summary`), mirroring what `DashboardPage.tsx` requests in each revision.

## GET /api/work-entries

| Metric | Baseline | After | Change |
|---|---|---|---|
| p50 latency | 4428.1 ms | 199.6 ms | -95.5% (better) |
| p95 latency | 13937.9 ms | 398.3 ms | -97.1% (better) |
| p99 latency | 16085.2 ms | 424.2 ms | -97.4% (better) |
| requests/sec | 5.4 | 111.2 | +1961.9% (better) |
| error rate | 0.00% | 0.00% | n/a |
| avg payload (decoded) | 10252.1 KB | 10.3 KB | -99.9% (better) |
| avg bytes on wire / iteration | 10253.2 KB | 2.2 KB | -100.0% (better) |

## GET /api/reports/client/:id

| Metric | Baseline | After | Change |
|---|---|---|---|
| p50 latency | 140.4 ms | 168.1 ms | +19.7% (worse) |
| p95 latency | 333.8 ms | 359.6 ms | +7.7% (worse) |
| p99 latency | 371.9 ms | 385.5 ms | +3.7% (worse) |
| requests/sec | 144.5 | 129.8 | -10.1% (worse) |
| error rate | 0.00% | 0.00% | n/a |
| avg payload (decoded) | 399.3 KB | 399.3 KB | -0.0% (better) |
| avg bytes on wire / iteration | 400.4 KB | 24.9 KB | -93.8% (better) |

## GET /api/reports/export/csv/:id

| Metric | Baseline | After | Change |
|---|---|---|---|
| p50 latency | 126.6 ms | 174.2 ms | +37.6% (worse) |
| p95 latency | 284.6 ms | 407.9 ms | +43.3% (worse) |
| p99 latency | 310.7 ms | 432.0 ms | +39.1% (worse) |
| requests/sec | 169.2 | 120.4 | -28.8% (worse) |
| error rate | 0.00% | 0.00% | n/a |
| avg payload (decoded) | 166.3 KB | 166.3 KB | -0.0% (better) |
| avg bytes on wire / iteration | 167.5 KB | 12.5 KB | -92.5% (better) |

## Dashboard load

| Metric | Baseline | After | Change |
|---|---|---|---|
| p50 latency | 3565.5 ms | 526.0 ms | -85.2% (better) |
| p95 latency | 20417.4 ms | 1165.0 ms | -94.3% (better) |
| p99 latency | 22823.9 ms | 1221.6 ms | -94.6% (better) |
| requests/sec | 10.0 | 40.9 | +307.6% (better) |
| error rate | 0.00% | 0.00% | n/a |
| avg payload (decoded) | 10256.4 KB | 1.1 KB | -100.0% (better) |
| avg bytes on wire / iteration | 10258.5 KB | 1.5 KB | -100.0% (better) |

<!-- analysis -->

## Analysis

### What drove the gains

| Endpoint | Primary driver | Secondary |
|---|---|---|
| `GET /api/work-entries` | **Server-side pagination** (`LIMIT 50 OFFSET 0` + separate `COUNT(*)`): the response went from all 50,000 rows (~10 MB) to 50 rows (~10 KB), p95 13.9 s -> 0.4 s, throughput 5.4 -> 111 req/s. | Composite index `(user_email, client_id, date)` lets the paginated list read the first page from the index without a full scan; gzip cuts the 10 KB page to ~2 KB on the wire. |
| Dashboard load | **`GET /api/reports/summary`**: three SQL aggregates + a `LIMIT 5` join replace downloading every client and every work entry to reduce in the browser. Payload 10.2 MB -> 1.1 KB, p95 20.4 s -> 1.2 s. | Single request instead of two; gzip. A cold single request is ~25 ms; the ~0.5 s p50 under load is the 50-VU queue on a single Node process, not query cost. |
| `GET /api/reports/client/:id` | **Compression**: 400 KB -> 25 KB on the wire (-94%). The `totalHours`/`entryCount` now come from `COALESCE(SUM(hours),0), COUNT(*)` served by the composite index instead of a JS `reduce` over `parseFloat`. | The endpoint still returns all ~2,500 rows for the client (report view is not paginated), so decoded payload is unchanged by design. |
| `GET /api/reports/export/csv/:id` | **Streaming** removed the temp-dir write, `csv-writer`, file read-back and `fs.unlink`; rows are written straight to the response in 64 KB chunks. **Compression** cuts the wire size 167 KB -> 12.5 KB (-92%). | Same column order / filename sanitisation as before. |

### Regressions / not improved

- **`GET /api/reports/client/:id` latency: +20% p50 / +8% p95 / -10% req/s.** The decoded payload is identical (report is deliberately unpaginated) and the aggregate is now cheaper, so the extra latency is the gzip CPU cost of compressing a 400 KB JSON body per request on a single-threaded Node process, measured over loopback where bandwidth is free. On a real network the 94% wire reduction dominates; if loopback/LAN latency matters more than bandwidth, tune `compression({ threshold })` or `level`, or paginate the report entries (the aggregate already covers the full set, so `entryCount`/`totalHours` would stay correct).
- **`GET /api/reports/export/csv/:id` latency: +38% p50 / +43% p95 / -29% req/s.** Same cause: gzip of ~170 KB text per request. The first after-run (per-row `res.write`) measured p50 248 ms; batching rows into 64 KB chunks brought it to 174 ms. Wire bytes are down 92%. This endpoint is a download, so wire size is the metric users feel.
- Nothing else regressed; error rate stayed 0% everywhere and no `http_req_failed` thresholds were crossed. The two `http_req_duration` p95 thresholds that failed in the baseline (`work-entries-list`, `dashboard-load`) pass in the after run.

### Correctness evidence

- `cd backend && npm test`: 186 tests pass (9 suites), including `src/__tests__/integration/sqlite.integration.test.js` which runs against a real in-memory SQLite: `SUM`/`COUNT` on decimal hours (`7.75`/`4`), `0`/`0` on an empty client, tenant isolation on a shared client id, gap-free pagination over the full set, streamed CSV shape, and `EXPLAIN QUERY PLAN` confirming `idx_work_entries_user_client_date` is used (and no `USE TEMP B-TREE FOR ORDER BY`) for the report aggregate, report list and paginated list queries.
- Manual: `GET /api/reports/export/pdf/1` still returns a valid 340-page PDF with `Content-Type: application/pdf` when `Accept-Encoding: gzip` is sent (`doc.pipe(res)` through `compression()`), and the streamed CSV arrives gzip-encoded with `Content-Type: text/csv`.
