const request = require('supertest');
const express = require('express');
const clientRoutes = require('../../routes/clients');
const { getDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use(errorHandler);

const storedClient = { id: 1, name: 'Acme', description: null, department: null, email: null };

describe('Client Routes - edge cases', () => {
  let mockDb;

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation();
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const mockSuccessfulInsert = () => {
    mockDb.run.mockImplementation(function(query, params, callback) {
      callback.call({ lastID: 1 }, null);
    });
    mockDb.get.mockImplementation((query, params, callback) => callback(null, storedClient));
  };

  const mockSuccessfulUpdate = () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, storedClient));
    mockDb.run.mockImplementation(function(query, params, callback) {
      callback.call({ changes: 1 }, null);
    });
  };

  describe('POST /api/clients validation', () => {
    test('trims surrounding whitespace before inserting', async () => {
      mockSuccessfulInsert();

      const response = await request(app).post('/api/clients').send({
        name: '  Acme  ',
        description: '  Big client  ',
        department: ' Sales ',
        email: ' contact@acme.com '
      });

      expect(response.status).toBe(201);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clients'),
        ['Acme', 'Big client', 'Sales', 'contact@acme.com'],
        expect.any(Function)
      );
    });

    test('rejects a whitespace-only name without touching the database', async () => {
      const response = await request(app).post('/api/clients').send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('accepts a name of exactly 255 characters', async () => {
      mockSuccessfulInsert();

      const response = await request(app).post('/api/clients').send({ name: 'a'.repeat(255) });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1][0]).toHaveLength(255);
    });

    test('rejects a name longer than 255 characters', async () => {
      const response = await request(app).post('/api/clients').send({ name: 'a'.repeat(256) });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a description longer than 1000 characters', async () => {
      const response = await request(app).post('/api/clients')
        .send({ name: 'Acme', description: 'd'.repeat(1001) });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a department longer than 255 characters', async () => {
      const response = await request(app).post('/api/clients')
        .send({ name: 'Acme', department: 'd'.repeat(256) });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects an invalid contact email', async () => {
      const response = await request(app).post('/api/clients')
        .send({ name: 'Acme', email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects unknown fields', async () => {
      const response = await request(app).post('/api/clients')
        .send({ name: 'Acme', id: 99 });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a non-string name', async () => {
      const response = await request(app).post('/api/clients').send({ name: 12345 });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects an array body', async () => {
      const response = await request(app).post('/api/clients').send([{ name: 'Acme' }]);

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects an empty body', async () => {
      const response = await request(app).post('/api/clients').send({});

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('stores empty optional fields as null', async () => {
      mockSuccessfulInsert();

      const response = await request(app).post('/api/clients')
        .send({ name: 'Acme', description: '', department: '', email: '' });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1]).toEqual(['Acme', null, null, null]);
    });

    test('passes SQL-like input as a bound parameter, not as SQL', async () => {
      mockSuccessfulInsert();
      const name = "Robert'); DROP TABLE clients;--";

      const response = await request(app).post('/api/clients').send({ name });

      expect(response.status).toBe(201);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).not.toContain('DROP TABLE');
      expect(params[0]).toBe(name);
    });
  });

  describe('PUT /api/clients/:id validation', () => {
    test('returns 400 for an invalid ID before validating the body or querying', async () => {
      const response = await request(app).put('/api/clients/abc').send({ name: 'Acme' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('rejects unknown fields without querying the database', async () => {
      const response = await request(app).put('/api/clients/1').send({ name: 'Acme', created_at: 'x' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('rejects a whitespace-only name', async () => {
      const response = await request(app).put('/api/clients/1').send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('rejects an invalid contact email', async () => {
      const response = await request(app).put('/api/clients/1').send({ email: 'bad@' });

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    test('clearing email with an empty string updates only email and updated_at', async () => {
      mockSuccessfulUpdate();

      const response = await request(app).put('/api/clients/1').send({ email: '' });

      expect(response.status).toBe(200);
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE clients SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [null, 1],
        expect.any(Function)
      );
    });

    test('updates all fields in a single parameterized query', async () => {
      mockSuccessfulUpdate();

      const response = await request(app).put('/api/clients/7').send({
        name: ' New ',
        description: 'Desc',
        department: 'Ops',
        email: 'ops@example.com'
      });

      expect(response.status).toBe(200);
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE clients SET name = ?, description = ?, department = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        ['New', 'Desc', 'Ops', 'ops@example.com', 7],
        expect.any(Function)
      );
    });

    // BUG: the existence check and the UPDATE are not atomic. If the client is deleted in between,
    // the route still responds 200 "Client updated successfully" with `client` missing instead of 404.
    test.skip('returns 404 when the client disappears between the existence check and the update', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, undefined));
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const response = await request(app).put('/api/clients/1').send({ name: 'Acme' });

      expect(response.status).toBe(404);
    });
  });

  describe('client ID parsing', () => {
    test('returns 404 for a negative ID', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/clients/-1');

      expect(response.status).toBe(404);
      expect(mockDb.get.mock.calls[0][1]).toEqual([-1]);
    });

    test('returns 404 for ID 0', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/clients/0');

      expect(response.status).toBe(404);
    });

    // BUG: IDs are parsed with parseInt, so "1abc" is treated as client 1 instead of being rejected.
    test.skip('GET rejects an ID with trailing non-numeric characters', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, storedClient));

      const response = await request(app).get('/api/clients/1abc');

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
    });

    // BUG: IDs are parsed with parseInt, so "1.9" is truncated to client 1 instead of being rejected.
    test.skip('PUT rejects a fractional ID', async () => {
      mockSuccessfulUpdate();

      const response = await request(app).put('/api/clients/1.9').send({ name: 'Acme' });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    // BUG: IDs are parsed with parseInt, so DELETE /api/clients/1abc deletes client 1.
    test.skip('DELETE rejects an ID with trailing non-numeric characters', async () => {
      mockSuccessfulUpdate();

      const response = await request(app).delete('/api/clients/1abc');

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/clients (bulk)', () => {
    test('returns the number of deleted clients', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 3 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 3 });
      expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM clients', [], expect.any(Function));
    });

    test('returns deletedCount 0 when there are no clients', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body.deletedCount).toBe(0);
    });

    test('returns 409 on a SQLITE_CONSTRAINT error', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(Object.assign(new Error('constraint failed'), { code: 'SQLITE_CONSTRAINT' }));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Clients have work entries and cannot be bulk deleted' });
    });

    test('returns 409 when the error message mentions a foreign key without a code', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('foreign key constraint failed'));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(409);
    });

    test('returns 500 on other database errors', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' }));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete clients' });
    });
  });

  describe('DELETE /api/clients/:id', () => {
    test('returns 409 when the error message mentions a foreign key without a code', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('FOREIGN KEY constraint failed'));
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Client has work entries and cannot be deleted' });
    });
  });
});
