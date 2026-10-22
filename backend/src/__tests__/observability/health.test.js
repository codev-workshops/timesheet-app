const express = require('express');
const request = require('supertest');
const { registerHealthRoutes } = require('../../observability/health');

function createApp(getDatabase) {
  const app = express();
  registerHealthRoutes(app, { getDatabase });
  return app;
}

describe('health routes', () => {
  test('returns the existing liveness payload', async () => {
    const response = await request(createApp(jest.fn())).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('OK');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  test('reports database readiness', async () => {
    const get = jest.fn((_sql, callback) => callback(null));
    const response = await request(createApp(() => ({ get }))).get('/health/ready');

    expect(get).toHaveBeenCalledWith('SELECT 1', expect.any(Function));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ready');
    expect(new Date(response.body.timestamp).toISOString()).toBe(response.body.timestamp);
  });

  test.each([
    ['a database error', () => ({
      get: (_sql, callback) => callback(new Error('database failed'))
    })],
    ['a database initialization error', () => {
      throw new Error('database initialization failed');
    }]
  ])('returns unavailable for %s', async (_description, getDatabase) => {
    const response = await request(createApp(getDatabase)).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'unavailable',
      error: 'Database not reachable'
    });
  });
});
