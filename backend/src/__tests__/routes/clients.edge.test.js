const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const { errorHandler } = require('../../middleware/errorHandler');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const clientRoutes = require('../../routes/clients');

const app = express();
app.use(express.json());
app.use('/api/clients', clientRoutes);
app.use(errorHandler);

const storedClient = { id: 1, name: 'Acme', description: null, department: null, email: null };

describe('Client Routes - edge cases', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = { all: jest.fn(), get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  const mockSuccessfulInsert = (lastID = 1) => {
    mockDb.run.mockImplementation(function (query, params, callback) {
      callback.call({ lastID, changes: 1 }, null);
    });
    mockDb.get.mockImplementation((query, params, callback) => callback(null, { ...storedClient, id: lastID }));
  };

  describe('client ID parsing', () => {
    test.each([
      ['get', 'abc'],
      ['put', 'abc'],
      ['delete', 'abc'],
      ['get', '%20']
    ])('%s /:id rejects non-numeric ID "%s" without touching the database', async (method, id) => {
      const response = await request(app)[method](`/api/clients/${id}`).send({ name: 'X' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(getDatabase).not.toHaveBeenCalled();
    });

    test.each([
      ['0', 0],
      ['-1', -1],
      ['99999999999', 99999999999],
      ['7abc', 7],
      ['2.5', 2]
    ])('GET /:id parses "%s" as %d and returns 404 when missing', async (id, parsed) => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).get(`/api/clients/${id}`);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
      expect(mockDb.get.mock.calls[0][1]).toEqual([parsed]);
    });
  });

  describe('GET /api/clients', () => {
    test('lists shared clients ordered by name without filtering by user', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      await request(app).get('/api/clients');

      const [sql, params] = mockDb.all.mock.calls[0];
      expect(sql).toMatch(/ORDER BY name$/);
      expect(sql).not.toMatch(/user_email/);
      expect(params).toEqual([]);
    });
  });

  describe('POST /api/clients validation', () => {
    test.each([
      ['whitespace-only name', { name: '   ' }],
      ['name over 255 characters', { name: 'a'.repeat(256) }],
      ['non-string name', { name: 123 }],
      ['null name', { name: null }],
      ['description over 1000 characters', { name: 'Acme', description: 'd'.repeat(1001) }],
      ['department over 255 characters', { name: 'Acme', department: 'd'.repeat(256) }],
      ['invalid email', { name: 'Acme', email: 'not-an-email' }],
      ['unknown field', { name: 'Acme', user_email: 'other@example.com' }],
      ['empty body', {}]
    ])('rejects %s with 400 and does not write', async (label, body) => {
      const response = await request(app).post('/api/clients').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(response.body.details.length).toBeGreaterThan(0);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a JSON array body', async () => {
      const response = await request(app).post('/api/clients').send([{ name: 'Acme' }]);

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('accepts fields at their maximum lengths', async () => {
      mockSuccessfulInsert();
      const body = {
        name: 'n'.repeat(255),
        description: 'd'.repeat(1000),
        department: 'p'.repeat(255)
      };

      const response = await request(app).post('/api/clients').send(body);

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1]).toEqual([body.name, body.description, body.department, null]);
    });

    test('trims whitespace before inserting', async () => {
      mockSuccessfulInsert();

      await request(app).post('/api/clients').send({
        name: '  Acme  ',
        description: ' Desc ',
        department: ' Eng ',
        email: ' contact@acme.com '
      });

      expect(mockDb.run.mock.calls[0][1]).toEqual(['Acme', 'Desc', 'Eng', 'contact@acme.com']);
    });

    test('stores empty optional strings as null', async () => {
      mockSuccessfulInsert();

      await request(app).post('/api/clients').send({ name: 'Acme', description: '', department: '', email: '' });

      expect(mockDb.run.mock.calls[0][1]).toEqual(['Acme', null, null, null]);
    });

    test('passes SQL-like input as a bound parameter', async () => {
      mockSuccessfulInsert();
      const name = "Robert'); DROP TABLE clients;--";

      await request(app).post('/api/clients').send({ name });

      const [sql, params] = mockDb.run.mock.calls[0];
      expect(sql).toBe('INSERT INTO clients (name, description, department, email) VALUES (?, ?, ?, ?)');
      expect(params[0]).toBe(name);
    });

    test('fetches the created client using the inserted row ID', async () => {
      mockSuccessfulInsert(42);

      const response = await request(app).post('/api/clients').send({ name: 'Acme' });

      expect(mockDb.get.mock.calls[0][1]).toEqual([42]);
      expect(response.body.client.id).toBe(42);
    });
  });

  describe('PUT /api/clients/:id', () => {
    const mockExistingClient = () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, storedClient));
      mockDb.run.mockImplementation(function (query, params, callback) {
        callback.call({ changes: 1 }, null);
      });
    };

    test.each([
      ['whitespace-only name', { name: '  ' }],
      ['invalid email', { email: 'bad@' }],
      ['unknown field', { id: 2 }],
      ['empty body', {}]
    ])('rejects %s with 400 before looking up the client', async (label, body) => {
      const response = await request(app).put('/api/clients/1').send(body);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Validation error');
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('only updates the provided field plus updated_at', async () => {
      mockExistingClient();

      await request(app).put('/api/clients/1').send({ department: 'Sales' });

      const [sql, params] = mockDb.run.mock.calls[0];
      expect(sql).toBe('UPDATE clients SET department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      expect(params).toEqual(['Sales', 1]);
    });

    test('updates all fields in a fixed order', async () => {
      mockExistingClient();

      await request(app).put('/api/clients/1').send({
        email: 'a@b.com',
        department: 'Eng',
        description: 'Desc',
        name: 'New'
      });

      const [sql, params] = mockDb.run.mock.calls[0];
      expect(sql).toBe(
        'UPDATE clients SET name = ?, description = ?, department = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      );
      expect(params).toEqual(['New', 'Desc', 'Eng', 'a@b.com', 1]);
    });

    test('clears optional fields when given empty strings', async () => {
      mockExistingClient();

      await request(app).put('/api/clients/1').send({ department: '', email: '' });

      expect(mockDb.run.mock.calls[0][1]).toEqual([null, null, 1]);
    });

    test('does not run an update when the client does not exist', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/clients/99').send({ name: 'New' });

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/clients (bulk)', () => {
    test('succeeds with deletedCount 0 when there are no clients', async () => {
      mockDb.run.mockImplementation(function (query, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 0 });
    });

    test('returns 409 for a SQLITE_CONSTRAINT error code', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(Object.assign(new Error('constraint failed'), { code: 'SQLITE_CONSTRAINT' }));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Clients have work entries and cannot be bulk deleted' });
    });

    test('returns 409 when only the message mentions a foreign key', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('foreign key mismatch'));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(409);
    });

    test('returns 500 for other database errors', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete clients' });
    });

    test('returns 500 for an error without a message', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback({}));

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
    });
  });

  describe('DELETE /api/clients/:id', () => {
    beforeEach(() => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
    });

    test('returns 409 when only the message mentions a foreign key', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('FOREIGN KEY constraint failed'));
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Client has work entries and cannot be deleted' });
    });

    test('returns 500 for other database errors', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(Object.assign(new Error('disk I/O error'), { code: 'SQLITE_IOERR' }));
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete client' });
    });

    test('deletes using the parsed numeric ID', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).delete('/api/clients/5abc');

      expect(response.status).toBe(200);
      expect(mockDb.run).toHaveBeenCalledWith('DELETE FROM clients WHERE id = ?', [5], expect.any(Function));
    });
  });
});
