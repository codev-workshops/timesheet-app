import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, clientIds, headers } from './config.js';

const maxVus = Number(__ENV.MAX_VUS) || 300;
const stages = __ENV.QUICK === '1'
  ? [{ duration: '10s', target: 5 }]
  : [
      { duration: '1m', target: 100 },
      { duration: '2m', target: maxVus },
      { duration: '1m', target: maxVus },
      { duration: '30s', target: 0 }
    ];
const ids = clientIds();

export const options = {
  scenarios: {
    read_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages
    }
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    'http_req_duration{name:work-entries}': ['p(95)<1500'],
    'http_req_duration{name:client-report}': ['p(95)<2000']
  }
};

function hasWorkEntries(response) {
  try {
    return Array.isArray(response.json('workEntries'));
  } catch {
    return false;
  }
}

export default function () {
  const workEntries = http.get(`${BASE_URL}/api/work-entries`, {
    headers: headers(),
    tags: { name: 'work-entries' }
  });
  check(workEntries, {
    'work entries status is 200': (response) => response.status === 200,
    'work entries body has an array': hasWorkEntries
  });

  const reportIds = [ids.large];
  if (ids.medium) {
    reportIds.push(ids.medium);
  }
  for (const clientId of reportIds) {
    const report = http.get(`${BASE_URL}/api/reports/client/${clientId}`, {
      headers: headers(),
      tags: { name: 'client-report' }
    });
    check(report, {
      'client report status is 200': (response) => response.status === 200,
      'client report body has an array': hasWorkEntries
    });
  }

  sleep(0.5);
}
