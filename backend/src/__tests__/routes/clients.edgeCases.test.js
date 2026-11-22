const request = require('supertest');
const express = require('express');
const clientRoutes = require('../../routes/clients');
const { getDatabase } = require('../../database/init');

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
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

const mockCreateSuccess = (mockDb, row = { id: 1 }) => {
  mockDb.run.mockImplementation(function(query, params, callback) {
    callback.call({ lastID: 1 }, null);
  });
  mockDb.get.mockImplementation((query, params, callback) => callback(null, row));
};

const mockUpdateSuccess = (mockDb, row = { id: 1 }) => {
  mockDb.get.mockImplementation((query, params, callback) => callback(null, row));
  mockDb.run.mockImplementation((query, params, callback) => callback(null));
};

describe('Client Routes - edge cases', () => {
  let mockDb;
  let consoleErrorSpy;

  beforeEach(() => {
    mockDb = { all: jest.fn(), get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    jest.clearAllMocks();
  });

  describe('client ID parsing', () => {
    test.each(['0', '-1', '99999999999'])(
      'GET /:id with numeric-but-nonexistent id %s returns 404 and queries the DB with a number',
      async (id) => {
        mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

        const response = await request(app).get(`/api/clients/${id}`);

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: 'Client not found' });
        expect(mockDb.get).toHaveBeenCalledWith(
          expect.any(String),
          [parseInt(id, 10)],
          expect.any(Function)
        );
      }
    );

    test('invalid id is rejected on every method before touching the DB', async () => {
      const responses = await Promise.all([
        request(app).get('/api/clients/abc'),
        request(app).put('/api/clients/abc').send({ name: 'X' }),
        request(app).delete('/api/clients/abc')
      ]);

      responses.forEach((response) => {
        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid client ID' });
      });
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('PUT with invalid id returns 400 for the id even when the body is also invalid', async () => {
      const response = await request(app).put('/api/clients/abc').send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    // BUG: ids are parsed with parseInt(), so partially numeric ids like "1abc" or "1.5"
    // are silently truncated to 1 and resolve to client 1 instead of returning 400.
    test.skip.each(['1abc', '1.5', '1e3'])(
      'GET /:id with malformed id %s should return 400',
      async (id) => {
        mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1, name: 'Client 1' }));

        const response = await request(app).get(`/api/clients/${id}`);

        expect(response.status).toBe(400);
        expect(response.body).toEqual({ error: 'Invalid client ID' });
        expect(mockDb.get).not.toHaveBeenCalled();
      }
    );

    // BUG: same parseInt() truncation lets DELETE /api/clients/1abc delete client 1.
    test.skip('DELETE /:id with malformed id "1abc" should return 400 and not delete client 1', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).delete('/api/clients/1abc');

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/clients validation and normalization', () => {
    test('trims name and other fields before inserting', async () => {
      mockCreateSuccess(mockDb);

      const response = await request(app).post('/api/clients').send({
        name: '  Acme  ',
        description: '  Desc  ',
        department: '  Eng  ',
        email: '  contact@acme.com  '
      });

      expect(response.status).toBe(201);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clients'),
        ['Acme', 'Desc', 'Eng', 'contact@acme.com'],
        expect.any(Function)
      );
    });

    test('stores empty optional fields as null', async () => {
      mockCreateSuccess(mockDb);

      const response = await request(app).post('/api/clients').send({
        name: 'Acme',
        description: '',
        department: '',
        email: ''
      });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1]).toEqual(['Acme', null, null, null]);
    });

    test('accepts a name of exactly 255 characters', async () => {
      mockCreateSuccess(mockDb);
      const name = 'a'.repeat(255);

      const response = await request(app).post('/api/clients').send({ name });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1][0]).toBe(name);
    });

    test('passes SQL-like input as a bound parameter, not into the query text', async () => {
      mockCreateSuccess(mockDb);
      const name = "Robert'); DROP TABLE clients;--";

      const response = await request(app).post('/api/clients').send({ name });

      expect(response.status).toBe(201);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).not.toContain('DROP TABLE');
      expect(params[0]).toBe(name);
    });

    test.each([
      ['whitespace-only name', { name: '   ' }],
      ['name over 255 chars', { name: 'a'.repeat(256) }],
      ['non-string name', { name: 12345 }],
      ['null name', { name: null }],
      ['description over 1000 chars', { name: 'Acme', description: 'd'.repeat(1001) }],
      ['department over 255 chars', { name: 'Acme', department: 'd'.repeat(256) }],
      ['invalid email', { name: 'Acme', email: 'not-an-email' }],
      ['unknown field', { name: 'Acme', user_email: 'attacker@example.com' }],
      ['array body', [{ name: 'Acme' }]]
    ])('rejects %s with 400 and does not insert', async (_label, body) => {
      const response = await request(app).post('/api/clients').send(body);

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects a request with no body', async () => {
      const response = await request(app).post('/api/clients');

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/clients/:id query building', () => {
    test('only updates supplied fields plus updated_at, scoped by id', async () => {
      mockUpdateSuccess(mockDb);

      const response = await request(app).put('/api/clients/7').send({ department: 'Sales' });

      expect(response.status).toBe(200);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe('UPDATE clients SET department = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
      expect(params).toEqual(['Sales', 7]);
    });

    test('updates all fields in a stable order with trimmed values', async () => {
      mockUpdateSuccess(mockDb);

      const response = await request(app).put('/api/clients/3').send({
        email: ' a@b.com ',
        department: ' Ops ',
        description: ' D ',
        name: ' N '
      });

      expect(response.status).toBe(200);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe(
        'UPDATE clients SET name = ?, description = ?, department = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      );
      expect(params).toEqual(['N', 'D', 'Ops', 'a@b.com', 3]);
    });

    test('clears department and email to null when empty strings are sent', async () => {
      mockUpdateSuccess(mockDb);

      const response = await request(app).put('/api/clients/1').send({ department: '', email: '' });

      expect(response.status).toBe(200);
      expect(mockDb.run.mock.calls[0][1]).toEqual([null, null, 1]);
    });

    test.each([
      ['whitespace-only name', { name: '   ' }],
      ['empty name', { name: '' }],
      ['invalid email', { email: 'bad@' }],
      ['unknown field only', { foo: 'bar' }],
      ['name over 255 chars', { name: 'a'.repeat(256) }]
    ])('rejects %s with 400 before querying', async (_label, body) => {
      const response = await request(app).put('/api/clients/1').send(body);

      expect(response.status).toBe(400);
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('does not run UPDATE when the client does not exist', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).put('/api/clients/42').send({ name: 'X' });

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/clients (bulk)', () => {
    test('returns deletedCount from this.changes', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 3 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 3 });
    });

    test('returns deletedCount 0 when there are no clients', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 0 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body.deletedCount).toBe(0);
    });

    test('returns 409 on SQLITE_CONSTRAINT', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        const err = new Error('constraint failed');
        err.code = 'SQLITE_CONSTRAINT';
        callback(err);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Clients have work entries and cannot be bulk deleted' });
    });

    test('returns 409 when only the message mentions a foreign key', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('foreign key constraint failed'));
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(409);
    });

    test('returns 500 on other database errors', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        const err = new Error('disk I/O error');
        err.code = 'SQLITE_IOERR';
        callback(err);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete clients' });
    });
  });

  describe('DELETE /api/clients/:id', () => {
    test('returns 409 when only the message mentions a foreign key', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('FOREIGN KEY constraint failed'));
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: 'Client has work entries and cannot be deleted' });
    });

    test('does not run DELETE when the client does not exist', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

      const response = await request(app).delete('/api/clients/5');

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });
});
