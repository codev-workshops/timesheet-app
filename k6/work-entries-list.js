import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, headers, rampingOptions } from './lib.js';

export const options = rampingOptions(2000);
const payloadBytes = new Trend('payload_bytes');

export default function () {
  const res = http.get(`${BASE_URL}/api/work-entries`, { headers });
  payloadBytes.add(res.body ? res.body.length : 0);
  check(res, {
    'status 200': (r) => r.status === 200,
    'has workEntries': (r) => r.status === 200 && Array.isArray(r.json('workEntries')),
  });
}
