const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
const { errorHandler } = require('../../middleware/errorHandler');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'owner@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);
app.use(errorHandler);

const validEntry = { clientId: 1, hours: 2.5, description: 'Work', date: '2024-01-15' };

describe('Work entry routes: error paths and isolation', () => {
  let mockDb;
  let consoleErrorSpy;

  beforeEach(() => {
    mockDb = { all: jest.fn(), get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('POST /api/work-entries', () => {
    test('returns 500 when the created entry cannot be read back', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(new Error('read failed')));
      mockDb.run.mockImplementation(function run(query, params, callback) {
        callback.call({ lastID: 77 }, null);
      });

      const response = await request(app).post('/api/work-entries').send(validEntry);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Work entry created but failed to retrieve' });
      expect(mockDb.get).toHaveBeenLastCalledWith(expect.any(String), [77], expect.any(Function));
    });

    test('inserts the entry under the authenticated user with NULL for missing description', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation(function run(query, params, callback) {
        callback.call({ lastID: 5 }, null);
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 1, date: '2024-01-15' });

      expect(response.status).toBe(201);
      expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'owner@example.com']);
      const params = mockDb.run.mock.calls[0][1];
      expect(params.slice(0, 4)).toEqual([1, 'owner@example.com', 1, null]);
      // Joi.date() converts the ISO string into a Date before it is bound.
      expect(params[4]).toBeInstanceOf(Date);
      expect(params[4].toISOString()).toBe('2024-01-15T00:00:00.000Z');
    });

    test.each([
      ['missing clientId', { hours: 1, date: '2024-01-15' }],
      ['zero hours', { ...validEntry, hours: 0 }],
      ['more than 24 hours', { ...validEntry, hours: 25 }],
      ['non-ISO date', { ...validEntry, date: 'not-a-date' }],
      ['missing date', { clientId: 1, hours: 1 }]
    ])('returns 400 validation envelope for %s', async (label, body) => {
      const response = await request(app).post('/api/work-entries').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details.length).toBeGreaterThan(0);
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    test('returns 500 when the updated entry cannot be read back', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(new Error('read failed')));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/work-entries/3').send({ hours: 4 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Work entry updated but failed to retrieve' });
    });

    test('rejects moving an entry to a client owned by another user', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/work-entries/3').send({ clientId: 99 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.get.mock.calls[1][1]).toEqual([99, 'owner@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('builds a user-scoped update with every provided field', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 3 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/work-entries/3')
        .send({ clientId: 2, hours: 6, description: '', date: '2024-03-01' });

      expect(response.status).toBe(200);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe(
        'UPDATE work_entries SET client_id = ?, hours = ?, description = ?, date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?'
      );
      expect(params).toEqual([2, 6, null, new Date('2024-03-01'), 3, 'owner@example.com']);
    });

    test('returns 400 validation envelope for an empty body', async () => {
      const response = await request(app).put('/api/work-entries/3').send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/work-entries', () => {
    test('scopes the client filter by the authenticated user', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/work-entries?clientId=4');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workEntries: [] });
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toContain('WHERE we.user_email = ?');
      expect(query).toContain('AND we.client_id = ?');
      expect(params).toEqual(['owner@example.com', 4]);
    });
  });
});
