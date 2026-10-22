const express = require('express');
const request = require('supertest');
const { metrics } = require('@opentelemetry/sdk-node');
const { applyObservability } = require('../../observability');
const { prometheusExporter } = require('../../observability/metricsExporter');

let meterProvider;
let app;

beforeAll(() => {
  meterProvider = new metrics.MeterProvider({ readers: [prometheusExporter] });
  meterProvider.getMeter('observability-test').createCounter('observability_test_counter').add(1);
  app = express();
  applyObservability(app);
  app.get('/request-id', (req, res) => res.json({ id: req.id }));
});

afterAll(async () => {
  await meterProvider.shutdown();
});

describe('observability HTTP middleware', () => {
  test('echoes a valid X-Request-Id', async () => {
    const response = await request(app).get('/request-id').set('X-Request-Id', 'test-123');

    expect(response.headers['x-request-id']).toBe('test-123');
    expect(response.body.id).toBe('test-123');
  });

  test('falls back to X-Correlation-Id', async () => {
    const response = await request(app).get('/request-id').set('X-Correlation-Id', 'correlation-123');

    expect(response.headers['x-request-id']).toBe('correlation-123');
    expect(response.body.id).toBe('correlation-123');
  });

  test('generates a UUID when no request ID is provided', async () => {
    const response = await request(app).get('/request-id');

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  test.each(['bad id', 'x'.repeat(129)])('replaces an invalid request ID: %s', async (id) => {
    const response = await request(app).get('/request-id').set('X-Request-Id', id);

    expect(response.headers['x-request-id']).not.toBe(id);
    expect(response.headers['x-request-id']).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  });

  test('serves Prometheus metrics from the Express port', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toMatch(/text\/plain/);
    expect(response.text).toContain('observability_test_counter');
  });
});
