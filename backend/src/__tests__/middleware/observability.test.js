const express = require('express');
const request = require('supertest');
const logger = require('../../config/logger');
const { requestContext } = require('../../middleware/requestContext');
const { requestLogger } = require('../../middleware/requestLogger');
const { registry, metricsMiddleware, metricsHandler } = require('../../config/metrics');

function buildApp() {
  const app = express();
  app.use(metricsMiddleware);
  app.use(requestLogger);
  app.use(express.json());
  app.use(requestContext);
  app.get('/health', (req, res) => res.json({ status: 'OK' }));
  app.get('/metrics', metricsHandler);
  const router = express.Router();
  router.get('/:id', (req, res) => res.json({ id: req.params.id, requestId: req.requestId }));
  router.get('/boom/:id', () => { throw new Error('boom'); });
  app.use('/api/things', router);
  app.use((err, req, res, next) => res.status(500).json({ error: err.message }));
  return app;
}

describe('Observability middleware', () => {
  let app;

  beforeEach(() => {
    app = buildApp();
    jest.spyOn(logger, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('requestContext', () => {
    test('generates a UUID request id and echoes it on the response', async () => {
      const res = await request(app).get('/api/things/1');
      expect(res.status).toBe(200);
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
      expect(res.body.requestId).toBe(res.headers['x-request-id']);
    });

    test('honours an incoming X-Request-Id header', async () => {
      const res = await request(app).get('/api/things/1').set('X-Request-Id', 'my-trace-id');
      expect(res.headers['x-request-id']).toBe('my-trace-id');
      expect(res.body.requestId).toBe('my-trace-id');
    });
  });

  describe('requestLogger', () => {
    test('logs method, route template, status and duration as structured fields', async () => {
      await request(app).get('/api/things/42').set('X-Request-Id', 'rid-1');

      expect(logger.log).toHaveBeenCalledWith('info', 'http request', expect.objectContaining({
        requestId: 'rid-1',
        method: 'GET',
        route: '/api/things/:id',
        path: '/api/things/42',
        status: 200,
        durationMs: expect.any(Number)
      }));
    });

    test('logs 5xx responses at error level', async () => {
      await request(app).get('/api/things/boom/1');
      expect(logger.log).toHaveBeenCalledWith('error', 'http request', expect.objectContaining({ status: 500 }));
    });
  });

  describe('metrics', () => {
    test('exposes prometheus text on /metrics with default metrics', async () => {
      const res = await request(app).get('/metrics');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe(registry.contentType);
      expect(res.text).toContain('process_cpu_user_seconds_total');
      expect(res.text).toContain('http_requests_total');
    });

    test('counts requests by route template and status, excluding /health from histogram', async () => {
      await request(app).get('/api/things/7');
      await request(app).get('/api/things/boom/7');
      await request(app).get('/health');

      const counter = await registry.getSingleMetric('http_requests_total').get();
      const find = (route, code) => counter.values.find(v => v.labels.route === route && v.labels.status_code === code);
      expect(find('/api/things/:id', '200').value).toBeGreaterThanOrEqual(1);
      expect(find('/api/things/boom/:id', '500').value).toBeGreaterThanOrEqual(1);
      expect(find('/health', '200').value).toBeGreaterThanOrEqual(1);

      const histogram = await registry.getSingleMetric('http_request_duration_seconds').get();
      const routes = new Set(histogram.values.map(v => v.labels.route));
      expect(routes.has('/api/things/:id')).toBe(true);
      expect(routes.has('/health')).toBe(false);
      expect(routes.has('/metrics')).toBe(false);
    });
  });
});

describe('tracing', () => {
  test('is disabled when no OTLP endpoint is configured', () => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
    delete process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;
    jest.resetModules();
    const tracing = require('../../tracing');
    expect(tracing.enabled).toBe(false);
    expect(tracing.sdk).toBeNull();
  });
});
