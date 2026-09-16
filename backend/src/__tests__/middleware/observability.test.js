const request = require('supertest');
const app = require('../../server');
const { logger, getRequestId } = require('../../config/logger');
const { getDatabase } = require('../../database/init');

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

    test('keeps the mounted route pattern for errors forwarded to the error handler', async () => {
      getDatabase().get.mockImplementation((query, params, cb) => cb(null, { email: params[0] }));
      const res400 = await request(app)
        .post('/api/clients')
        .set('x-user-email', 'metrics@example.com')
        .send({});
      expect(res400.status).toBe(400);

      const res = await request(app).get('/metrics');
      expect(res.text).toContain(
        'http_requests_total{method="POST",route="/api/clients/",status_code="400"'
      );
    });

    test('labels unknown paths as unmatched instead of the raw URL', async () => {
      await request(app).get('/definitely-not-a-route-1');
      await request(app).get('/definitely-not-a-route-2');
      const res = await request(app).get('/metrics');

      expect(res.text).toContain(
        'http_requests_total{method="GET",route="unmatched",status_code="404"'
      );
      expect(res.text).not.toContain('definitely-not-a-route');
    });
  });

  describe('error serialization', () => {
    test('serializes err metadata with message and stack', () => {
      const { MESSAGE } = require('triple-beam');
      const info = logger.format.transform({
        level: 'error',
        message: 'boom',
        err: new TypeError('bad thing')
      });
      const entry = JSON.parse(info[MESSAGE]);

      expect(entry.err).toMatchObject({ name: 'TypeError', message: 'bad thing' });
      expect(entry.err.stack).toContain('TypeError: bad thing');
    });
  });
});
