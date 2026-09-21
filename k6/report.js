// Builds perf-reports/<label>.md from perf-reports/<label>.json, and
// perf-reports/comparison.md when both baseline.json and after.json exist.
//   node k6/report.js            -> baseline.md, after.md (if present), comparison.md (if both)
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'perf-reports');

const SCRIPTS = {
  'work-entries-list': 'GET /api/work-entries',
  'client-report': 'GET /api/reports/client/:id',
  'csv-export': 'GET /api/reports/export/csv/:id',
  'dashboard-load': 'Dashboard load',
};

function load(label) {
  const f = path.join(DIR, `${label}.json`);
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

function row(summary) {
  const m = summary.metrics;
  const dur = m.http_req_duration || {};
  const rate = m.http_reqs || {};
  const failed = m.http_req_failed || {};
  const bytes = m.payload_bytes || {};
  const received = m.data_received || {};
  const iterationCount = (m.iterations || {}).count;
  return {
    wire: received.count && iterationCount ? received.count / iterationCount : undefined,
    p50: dur.med,
    p95: dur['p(95)'],
    p99: dur['p(99)'],
    rps: rate.rate,
    iterations: (m.iterations || {}).count,
    errorRate: failed.value,
    payload: bytes.avg,
    thresholdsFailed: Object.values(summary.metrics)
      .flatMap((x) => Object.values(x.thresholds || {}))
      .filter((v) => v === true || (v && v.ok === false)).length,
  };
}

const ms = (v) => (v == null ? 'n/a' : `${v.toFixed(1)} ms`);
const num = (v, d = 1) => (v == null ? 'n/a' : v.toFixed(d));
const pct = (v) => (v == null ? 'n/a' : `${(v * 100).toFixed(2)}%`);
const kb = (v) => (v == null ? 'n/a' : `${(v / 1024).toFixed(1)} KB`);

function labelMd(label, data) {
  const lines = [
    `# k6 ${label} report`,
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Seed parameters: `SEED_PERF=1 SEED_USER_EMAIL=perf@example.com SEED_CLIENTS=20 SEED_ENTRIES=50000 SEED_RANDOM_SEED=42` (see `backend/scripts/seed.js`).',
    'Load profile per script: 10s ramp to 10 VUs, 20s ramp to 50 VUs, 10s ramp to 0 (see `k6/lib.js`).',
    label === 'baseline'
      ? 'Dashboard script mode: `legacy` (GET /api/clients + GET /api/work-entries, all rows).'
      : 'Dashboard script mode: `summary` (GET /api/reports/summary).',
    '',
    '| Endpoint | p50 | p95 | p99 | req/s | iterations | error rate | avg payload (decoded) | avg bytes on wire / iteration | thresholds failed |',
    '|---|---|---|---|---|---|---|---|---|---|',
  ];
  for (const [key, name] of Object.entries(SCRIPTS)) {
    if (!data[key]) continue;
    const r = row(data[key]);
    lines.push(
      `| ${name} | ${ms(r.p50)} | ${ms(r.p95)} | ${ms(r.p99)} | ${num(r.rps)} | ${r.iterations} | ${pct(r.errorRate)} | ${kb(r.payload)} | ${kb(r.wire)} | ${r.thresholdsFailed} |`
    );
  }
  lines.push('', 'Raw per-script k6 output: `perf-reports/' + label + '/*.txt`, JSON: `perf-reports/' + label + '.json`.', '');
  return lines.join('\n');
}

function improvement(before, after, lowerIsBetter = true) {
  if (before == null || after == null || before === 0) return 'n/a';
  const delta = lowerIsBetter ? (before - after) / before : (after - before) / before;
  const sign = delta >= 0 ? '-' : '+';
  const label = lowerIsBetter ? `${sign}${Math.abs(delta * 100).toFixed(1)}%` : `${delta >= 0 ? '+' : '-'}${Math.abs(delta * 100).toFixed(1)}%`;
  return delta >= 0 ? `${label} (better)` : `${label} (worse)`;
}

function comparisonMd(base, after) {
  const lines = [
    '# Baseline vs After',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Identical seed (`SEED_CLIENTS=20 SEED_ENTRIES=50000 SEED_RANDOM_SEED=42`) and identical k6 stage profile for both runs.',
    'The dashboard script ran in `legacy` mode for the baseline (clients + all work entries) and `summary` mode for the after run (`GET /api/reports/summary`), mirroring what `DashboardPage.tsx` requests in each revision.',
    '',
  ];
  for (const [key, name] of Object.entries(SCRIPTS)) {
    if (!base[key] || !after[key]) continue;
    const b = row(base[key]);
    const a = row(after[key]);
    lines.push(`## ${name}`, '', '| Metric | Baseline | After | Change |', '|---|---|---|---|');
    lines.push(`| p50 latency | ${ms(b.p50)} | ${ms(a.p50)} | ${improvement(b.p50, a.p50)} |`);
    lines.push(`| p95 latency | ${ms(b.p95)} | ${ms(a.p95)} | ${improvement(b.p95, a.p95)} |`);
    lines.push(`| p99 latency | ${ms(b.p99)} | ${ms(a.p99)} | ${improvement(b.p99, a.p99)} |`);
    lines.push(`| requests/sec | ${num(b.rps)} | ${num(a.rps)} | ${improvement(b.rps, a.rps, false)} |`);
    lines.push(`| error rate | ${pct(b.errorRate)} | ${pct(a.errorRate)} | ${improvement(b.errorRate, a.errorRate)} |`);
    lines.push(`| avg payload (decoded) | ${kb(b.payload)} | ${kb(a.payload)} | ${improvement(b.payload, a.payload)} |`);
    lines.push(`| avg bytes on wire / iteration | ${kb(b.wire)} | ${kb(a.wire)} | ${improvement(b.wire, a.wire)} |`);
    lines.push('');
  }
  return lines.join('\n');
}

const baseline = load('baseline');
const after = load('after');
if (baseline) fs.writeFileSync(path.join(DIR, 'baseline.md'), labelMd('baseline', baseline));
if (after) fs.writeFileSync(path.join(DIR, 'after.md'), labelMd('after', after));
if (baseline && after) {
  const existing = path.join(DIR, 'comparison.md');
  const generated = comparisonMd(baseline, after);
  // Preserve hand-written analysis appended after the marker, if any.
  const marker = '\n<!-- analysis -->\n';
  let tail = '';
  if (fs.existsSync(existing)) {
    const cur = fs.readFileSync(existing, 'utf8');
    const i = cur.indexOf(marker);
    if (i >= 0) tail = cur.slice(i);
  }
  fs.writeFileSync(existing, generated + (tail || marker));
}
console.log('reports written to', DIR);
