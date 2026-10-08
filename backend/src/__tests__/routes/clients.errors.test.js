const request = require('supertest');
const express = require('express');
const clientRoutes = require('../../routes/clients');
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
app.use('/api/clients', clientRoutes);
app.use(errorHandler);

describe('Client routes: error paths and isolation', () => {
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

  describe('POST /api/clients', () => {
    test('returns 500 when the created client cannot be read back', async () => {
      mockDb.run.mockImplementation(function run(query, params, callback) {
        callback.call({ lastID: 42 }, null);
      });
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('read failed')));

      const response = await request(app).post('/api/clients').send({ name: 'New Client' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Client created but failed to retrieve' });
      expect(mockDb.get).toHaveBeenCalledWith(expect.any(String), [42], expect.any(Function));
    });

    test('stores the client under the authenticated user', async () => {
      mockDb.run.mockImplementation(function run(query, params, callback) {
        callback.call({ lastID: 1 }, null);
      });
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1, name: 'C' }));

      await request(app).post('/api/clients').send({ name: 'C', email: 'c@example.com' });

      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toMatch(/INSERT INTO clients/);
      expect(params).toContain('owner@example.com');
    });

    test.each([
      ['missing name', {}],
      ['empty name', { name: '' }],
      ['invalid email', { name: 'C', email: 'not-an-email' }],
      ['unknown field', { name: 'C', extra: true }]
    ])('returns 400 validation envelope for %s', async (label, body) => {
      const response = await request(app).post('/api/clients').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(Array.isArray(response.body.details)).toBe(true);
      expect(response.body.details.length).toBeGreaterThan(0);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/clients/:id', () => {
    test('returns 500 when ownership lookup fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(new Error('db down')));

      const response = await request(app).put('/api/clients/1').send({ name: 'Renamed' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 404 for a client owned by another user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/clients/9').send({ name: 'Renamed' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT id FROM clients WHERE id = ? AND user_email = ?',
        [9, 'owner@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('returns 500 when the updated client cannot be read back', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(new Error('read failed')));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/clients/1').send({ name: 'Renamed' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Client updated but failed to retrieve' });
    });

    test('maps empty optional fields to NULL and scopes the update by user', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/clients/1')
        .send({ description: '', department: '', email: '' });

      expect(response.status).toBe(200);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe(
        'UPDATE clients SET description = ?, department = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?'
      );
      expect(params).toEqual([null, null, null, 1, 'owner@example.com']);
    });

    test('returns 400 validation envelope for an invalid email', async () => {
      const response = await request(app).put('/api/clients/1').send({ email: 'nope' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/clients', () => {
    test('deletes only the authenticated user\'s clients and reports the count', async () => {
      mockDb.run.mockImplementation(function run(query, params, callback) {
        callback.call({ changes: 3 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 3 });
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM clients WHERE user_email = ?',
        ['owner@example.com'],
        expect.any(Function)
      );
    });

    test('returns 500 when the bulk delete fails', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('locked')));

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete clients' });
    });
  });
});
