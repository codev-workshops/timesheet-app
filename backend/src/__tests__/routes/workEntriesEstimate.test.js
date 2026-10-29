const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
const { getDatabase } = require('../../database/init');
const mlClient = require('../../services/mlClient');

jest.mock('../../database/init');
jest.mock('../../services/mlClient', () => {
  const actual = jest.requireActual('../../services/mlClient');
  return { ...actual, predictHours: jest.fn() };
});

const { MlServiceError } = mlClient;

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const USER = 'test@example.com';
const clients = [
  { id: 1, department: 'Engineering', user_email: USER },
  { id: 2, department: null, user_email: USER },
  { id: 99, department: 'Sales', user_email: 'other@example.com' }
];

describe('GET /api/work-entries/estimate', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      run: jest.fn(),
      get: jest.fn((query, params, callback) => {
        if (query.includes('FROM users')) {
          return callback(null, { email: params[0] });
        }
        if (query.includes('FROM clients')) {
          const [id, email] = params;
          const row = clients.find((c) => c.id === id && c.user_email === email);
          return callback(null, row && { id: row.id, department: row.department });
        }
        return callback(null, undefined);
      })
    };
    getDatabase.mockReturnValue(mockDb);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    console.error.mockRestore();
  });

  const get = (query) => request(app)
    .get('/api/work-entries/estimate')
    .query(query)
    .set('x-user-email', USER);

  test('returns the estimate and forwards client department and authenticated email', async () => {
    mlClient.predictHours.mockResolvedValue({ estimatedHours: 2.5, modelVersion: 'xgb-1' });

    const response = await get({ clientId: 1, description: 'Code review', date: '2026-10-29' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ estimatedHours: 2.5, modelVersion: 'xgb-1' });
    expect(mlClient.predictHours).toHaveBeenCalledWith({
      clientId: 1,
      description: 'Code review',
      userEmail: USER,
      date: '2026-10-29',
      department: 'Engineering'
    });
    expect(mockDb.get).toHaveBeenCalledWith(
      'SELECT id, department FROM clients WHERE id = ? AND user_email = ?',
      [1, USER],
      expect.any(Function)
    );
  });

  test('defaults description to empty string and normalises ISO datetimes to a date', async () => {
    mlClient.predictHours.mockResolvedValue({ estimatedHours: 1, modelVersion: 'v' });

    const response = await get({ clientId: 2, date: '2026-10-29T10:30:00Z' });

    expect(response.status).toBe(200);
    expect(mlClient.predictHours).toHaveBeenCalledWith(expect.objectContaining({
      description: '',
      date: '2026-10-29',
      department: null
    }));
  });

  test('returns 503 when the ML service times out', async () => {
    mlClient.predictHours.mockRejectedValue(new MlServiceError('timed out', 'TIMEOUT'));

    const response = await get({ clientId: 1, description: 'x', date: '2026-10-29' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Hours estimate service unavailable' });
  });

  test('returns 503 when the ML service errors', async () => {
    mlClient.predictHours.mockRejectedValue(new MlServiceError('status 500', 'HTTP_ERROR', { status: 500 }));

    const response = await get({ clientId: 1, description: 'x', date: '2026-10-29' });

    expect(response.status).toBe(503);
    expect(response.body).toEqual({ error: 'Hours estimate service unavailable' });
  });

  test.each([
    ['missing clientId', { date: '2026-10-29' }],
    ['non-numeric clientId', { clientId: 'abc', date: '2026-10-29' }],
    ['negative clientId', { clientId: -1, date: '2026-10-29' }],
    ['missing date', { clientId: 1 }],
    ['invalid date', { clientId: 1, date: 'yesterday' }],
    ['too long description', { clientId: 1, date: '2026-10-29', description: 'a'.repeat(1001) }],
    ['unknown parameter', { clientId: 1, date: '2026-10-29', foo: 'bar' }]
  ])('returns 400 for %s', async (label, query) => {
    const response = await get(query);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Validation error');
    expect(mlClient.predictHours).not.toHaveBeenCalled();
  });

  test('returns 401 without authentication', async () => {
    const response = await request(app)
      .get('/api/work-entries/estimate')
      .query({ clientId: 1, date: '2026-10-29' });

    expect(response.status).toBe(401);
    expect(mlClient.predictHours).not.toHaveBeenCalled();
  });

  test("returns 404 for another user's client", async () => {
    const response = await get({ clientId: 99, date: '2026-10-29' });

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Client not found' });
    expect(mlClient.predictHours).not.toHaveBeenCalled();
  });

  test('returns 500 on database error', async () => {
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('FROM users')) return callback(null, { email: params[0] });
      return callback(new Error('db down'));
    });

    const response = await get({ clientId: 1, date: '2026-10-29' });

    expect(response.status).toBe(500);
    expect(mlClient.predictHours).not.toHaveBeenCalled();
  });

  test('POST /api/work-entries still succeeds when the ML client fails', async () => {
    mlClient.predictHours.mockRejectedValue(new MlServiceError('down', 'NETWORK'));
    const created = { id: 10, client_id: 1, hours: 2, description: 'Work', date: '2026-10-29', client_name: 'A' };
    mockDb.get.mockImplementation((query, params, callback) => {
      if (query.includes('FROM users')) return callback(null, { email: params[0] });
      if (query.includes('FROM clients')) return callback(null, { id: 1 });
      return callback(null, created);
    });
    mockDb.run.mockImplementation((query, params, callback) => {
      callback.call({ lastID: 10 }, null);
    });

    const response = await request(app)
      .post('/api/work-entries')
      .set('x-user-email', USER)
      .send({ clientId: 1, hours: 2, description: 'Work', date: '2026-10-29' });

    expect(response.status).toBe(201);
    expect(response.body.workEntry).toEqual(created);
    expect(mlClient.predictHours).not.toHaveBeenCalled();
  });
});
