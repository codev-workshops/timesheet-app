const request = require('supertest');
const app = require('../../server');
const { logger, getRequestId } = require('../../config/logger');

describe('Observability', () => {
  describe('request correlation', () => {
    test('echoes an incoming x-request-id header', async () => {
      const res = await request(app).get('/health').set('x-request-id', 'abc-123');

      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toBe('abc-123');
    });

    test('generates a UUID when no x-request-id header is provided', async () => {
      const res = await request(app).get('/health');

      expect(res.headers['x-request-id']).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
    });

    test('exposes the request id to the logger via AsyncLocalStorage', async () => {
      const seen = [];
      const spy = jest.spyOn(logger, 'info').mockImplementation((message, meta) => {
        seen.push({ message, meta, contextId: getRequestId() });
        return logger;
      });

      await request(app).get('/health').set('x-request-id', 'ctx-1');

      const access = seen.find((entry) => entry.message === 'HTTP request');
      expect(access).toBeDefined();
      expect(access.meta.requestId).toBe('ctx-1');
      expect(access.contextId).toBe('ctx-1');
      expect(access.meta).toMatchObject({ method: 'GET', url: '/health', status: 200 });
      expect(typeof access.meta.responseTimeMs).toBe('number');

      spy.mockRestore();
    });
  });

  describe('GET /metrics', () => {
    test('returns Prometheus metrics without authentication', async () => {
      await request(app).get('/health');
      const res = await request(app).get('/metrics');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.text).toContain('process_cpu_user_seconds_total');
      expect(res.text).toContain('http_requests_total{method="GET",route="/health",status_code="200"');
      expect(res.text).toContain('http_request_duration_seconds_bucket');
    });

    test('labels unauthenticated API errors and counts them', async () => {
      await request(app).get('/api/clients');
      const res = await request(app).get('/metrics');

      expect(res.text).toContain(
        'http_request_errors_total{method="GET",route="/api/clients",status_code="401"'
      );
    });
  });
});
