import http from 'k6/http';
import { check } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, CLIENT_ID, headers, rampingOptions } from './lib.js';

export const options = rampingOptions(3000);
const payloadBytes = new Trend('payload_bytes');

export default function () {
  const res = http.get(`${BASE_URL}/api/reports/export/csv/${CLIENT_ID}`, { headers });
  payloadBytes.add(res.body ? res.body.length : 0);
  check(res, {
    'status 200': (r) => r.status === 200,
    'is csv': (r) => (r.headers['Content-Type'] || '').includes('text/csv'),
    'has header row': (r) => r.status === 200 && String(r.body).startsWith('Date,Hours,Description,Created At'),
  });
}
