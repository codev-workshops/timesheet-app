import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, headers, rampingOptions } from './lib.js';

// DASHBOARD_MODE=legacy  -> getClients() + getWorkEntries() (all rows), as the original DashboardPage did
// DASHBOARD_MODE=summary -> GET /api/reports/summary (new endpoint)
const MODE = __ENV.DASHBOARD_MODE || 'legacy';

export const options = rampingOptions(2000);
const payloadBytes = new Trend('payload_bytes');

export default function () {
  if (MODE === 'summary') {
    const res = http.get(`${BASE_URL}/api/reports/summary`, { headers });
    payloadBytes.add(res.body ? res.body.length : 0);
    check(res, {
      'status 200': (r) => r.status === 200,
      'has totals': (r) => r.status === 200 && typeof r.json('totalHours') === 'number',
    });
    return;
  }
  const responses = http.batch([
    ['GET', `${BASE_URL}/api/clients`, null, { headers }],
    ['GET', `${BASE_URL}/api/work-entries`, null, { headers }],
  ]);
  let bytes = 0;
  for (const r of responses) bytes += r.body ? r.body.length : 0;
  payloadBytes.add(bytes);
  check(responses[0], { 'clients 200': (r) => r.status === 200 });
  check(responses[1], { 'work-entries 200': (r) => r.status === 200 });
}
