// Contract between the backend and the ML service (ml/serve.py, POST /predict).
const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');

const USER = 'alice@example.com';
const REQUEST_KEYS = ['clientId', 'description', 'userEmail', 'date', 'department'];

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);

function okResponse(body) {
  return { ok: true, status: 200, json: jest.fn().mockResolvedValue(body) };
}

function expectContractRequestBody(body) {
  expect(Object.keys(body).every((key) => REQUEST_KEYS.includes(key))).toBe(true);
  expect(Number.isInteger(body.clientId)).toBe(true);
  expect(typeof body.description).toBe('string');
  expect(typeof body.userEmail).toBe('string');
  expect(typeof body.date).toBe('string');
  expect(body.date).toMatch(/^\d{4}-\d{2}-\d{2}(T.*)?$/);
  if ('department' in body) {
    expect(body.department === null || typeof body.department === 'string').toBe(true);
  }
}

describe('ML service contract', () => {
  const originalFetch = global.fetch;
  const originalUrl = process.env.ML_SERVICE_URL;
  let department;

  beforeEach(() => {
    process.env.ML_SERVICE_URL = 'http://ml:8000';
    department = 'Engineering';
    global.fetch = jest.fn();
    getDatabase.mockReturnValue({
      get: jest.fn((query, params, callback) => {
        if (query.includes('FROM users')) return callback(null, { email: params[0] });
        return callback(null, { id: params[0], department });
      })
    });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.ML_SERVICE_URL;
    else process.env.ML_SERVICE_URL = originalUrl;
    console.error.mockRestore();
    jest.clearAllMocks();
  });

  const estimate = (query) => request(app)
    .get('/api/work-entries/estimate')
    .query(query)
    .set('x-user-email', USER);

  test('sends exactly the contract request body as JSON to POST /predict', async () => {
    global.fetch.mockResolvedValue(okResponse({ estimatedHours: 2.5, modelVersion: 'xgb-20261029-abc123' }));

    const response = await estimate({ clientId: 3, description: 'Code review for PR', date: '2026-10-29' });

    expect(response.status).toBe(200);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe('http://ml:8000/predict');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(init.body);
    expect(body).toEqual({
      clientId: 3,
      description: 'Code review for PR',
      userEmail: USER,
      date: '2026-10-29',
      department: 'Engineering'
    });
    expectContractRequestBody(body);
  });

  test('sends department as null and description as "" when absent', async () => {
    department = null;
    global.fetch.mockResolvedValue(okResponse({ estimatedHours: 1, modelVersion: 'v1' }));

    await estimate({ clientId: 7, date: '2026-10-29' });

    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expectContractRequestBody(body);
    expect(body.department).toBeNull();
    expect(body.description).toBe('');
  });

  test('accepts the contract response shape and returns it unchanged', async () => {
    global.fetch.mockResolvedValue(okResponse({ estimatedHours: 0.25, modelVersion: 'xgb-20261029-abc123' }));

    const response = await estimate({ clientId: 3, date: '2026-10-29' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ estimatedHours: 0.25, modelVersion: 'xgb-20261029-abc123' });
    expect(typeof response.body.estimatedHours).toBe('number');
    expect(typeof response.body.modelVersion).toBe('string');
  });

  test.each([
    [{ estimatedHours: '2.5', modelVersion: 'v' }],
    [{ estimatedHours: 2.5 }],
    [{ hours: 2.5, version: 'v' }]
  ])('rejects a non-contract response %j with 503', async (body) => {
    global.fetch.mockResolvedValue(okResponse(body));

    const response = await estimate({ clientId: 3, date: '2026-10-29' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Hours estimate service unavailable' });
  });

  test('maps a 503 model-not-loaded response to 503', async () => {
    global.fetch.mockResolvedValue({ ok: false, status: 503, json: jest.fn().mockResolvedValue({ detail: 'Model not loaded' }) });

    const response = await estimate({ clientId: 3, date: '2026-10-29' });

    expect(response.status).toBe(503);
  });
});
