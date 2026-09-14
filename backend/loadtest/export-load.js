import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend } from 'k6/metrics';
import { BASE_URL, clientIds, headers } from './config.js';

const maxVus = Number(__ENV.MAX_VUS) || 30;
const stages = __ENV.QUICK === '1'
  ? [{ duration: '10s', target: 5 }]
  : [
      { duration: '30s', target: 5 },
      { duration: '1m', target: 15 },
      { duration: '1m', target: maxVus },
      { duration: '30s', target: 0 }
    ];
const ids = clientIds();
const clientId = __ENV.EXPORT_CLIENT_ID || ids.large;
const exportBodyBytes = new Trend('export_body_bytes');

export const options = {
  scenarios: {
    export_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<10000', 'p(99)<20000'],
    'http_req_duration{name:csv-export}': ['p(95)<10000'],
    'http_req_duration{name:pdf-export}': ['p(95)<20000']
  }
};

function bodyBytes(response) {
  if (response.body instanceof ArrayBuffer) {
    return response.body.byteLength;
  }
  return response.body ? response.body.length : 0;
}

function contentType(response) {
  return String(response.headers['Content-Type'] || response.headers['content-type'] || '').toLowerCase();
}

function startsWithPdf(response) {
  if (response.body instanceof ArrayBuffer) {
    const bytes = new Uint8Array(response.body);
    return bytes.length >= 4 && bytes[0] === 37 && bytes[1] === 80 && bytes[2] === 68 && bytes[3] === 70;
  }
  return String(response.body || '').startsWith('%PDF');
}

export default function () {
  const requestOptions = {
    headers: headers(),
    responseType: 'binary',
    timeout: '60s'
  };
  const csv = http.get(`${BASE_URL}/api/reports/export/csv/${clientId}`, {
    ...requestOptions,
    tags: { name: 'csv-export' }
  });
  const csvSize = bodyBytes(csv);
  exportBodyBytes.add(csvSize, { name: 'csv-export' });
  check(csv, {
    'CSV status is 200': (response) => response.status === 200,
    'CSV content type is text/csv': (response) => contentType(response).includes('text/csv'),
    'CSV body is larger than 100 bytes': () => csvSize > 100
  });

  const pdf = http.get(`${BASE_URL}/api/reports/export/pdf/${clientId}`, {
    ...requestOptions,
    tags: { name: 'pdf-export' }
  });
  const pdfSize = bodyBytes(pdf);
  exportBodyBytes.add(pdfSize, { name: 'pdf-export' });
  check(pdf, {
    'PDF status is 200': (response) => response.status === 200,
    'PDF content type is application/pdf': (response) => contentType(response).includes('application/pdf'),
    'PDF body is larger than 1000 bytes': () => pdfSize > 1000,
    'PDF starts with magic bytes': startsWithPdf
  });

  sleep(1);
}
