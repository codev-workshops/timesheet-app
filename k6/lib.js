export const BASE_URL = __ENV.BASE_URL || 'http://localhost:3001';
export const USER_EMAIL = __ENV.USER_EMAIL || 'perf@example.com';
export const CLIENT_ID = __ENV.CLIENT_ID || '1';

export const headers = { 'x-user-email': USER_EMAIL, 'Accept-Encoding': 'gzip' };

export function rampingOptions(p95Ms) {
  return {
    stages: [
      { duration: '10s', target: 10 },
      { duration: '20s', target: 50 },
      { duration: '10s', target: 0 },
    ],
    thresholds: {
      http_req_duration: [`p(95)<${p95Ms}`],
      http_req_failed: ['rate<0.01'],
    },
    summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)'],
  };
}
