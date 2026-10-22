const request = require('supertest');
const express = require('express');
const clientRoutes = require('../../routes/clients');
const { getDatabase } = require('../../database/init');
const { createSequentialDb } = require('../helpers/sequentialDb');

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
// Add error handler for Joi validation
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

describe('Client Routes', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      get: jest.fn(),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/clients', () => {
    test('should return all clients for authenticated user', async () => {
      const mockClients = [
        { id: 1, name: 'Client A', description: 'Desc A', created_at: '2024-01-01', updated_at: '2024-01-01' },
        { id: 2, name: 'Client B', description: 'Desc B', created_at: '2024-01-02', updated_at: '2024-01-02' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockClients);
      });

      const response = await request(app).get('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ clients: mockClients });
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT id, name, description'),
        ['test@example.com'],
        expect.any(Function)
      );
    });

    test('should return empty array when no clients exist', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ clients: [] });
    });

    test('should handle database error', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/clients/:id', () => {
    test('should return specific client', async () => {
      const mockClient = { id: 1, name: 'Client A', description: 'Desc A' };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockClient);
      });

      const response = await request(app).get('/api/clients/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ client: mockClient });
    });

    test('should return 404 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/clients/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).get('/api/clients/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should handle database error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/clients/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/clients', () => {
    test('should create new client with valid data', async () => {
      const newClient = { name: 'New Client', description: 'New Description' };
      const createdClient = { id: 1, ...newClient, created_at: '2024-01-01', updated_at: '2024-01-01' };

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, createdClient);
      });

      const response = await request(app)
        .post('/api/clients')
        .send(newClient);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Client created successfully');
      expect(response.body.client).toEqual(createdClient);
    });

    test('should create client without description', async () => {
      const newClient = { name: 'Client Without Desc' };
      const createdClient = { id: 1, name: 'Client Without Desc', description: null };

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, createdClient);
      });

      const response = await request(app)
        .post('/api/clients')
        .send(newClient);

      expect(response.status).toBe(201);
    });

    test('should return 400 for missing name', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({ description: 'No name provided' });

      expect(response.status).toBe(400);
    });

    test('should return 400 for empty name', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({ name: '' });

      expect(response.status).toBe(400);
    });

    test('should handle database insert error', async () => {
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Test Client' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create client' });
    });
  });

  describe('PUT /api/clients/:id', () => {
    test('should update client name', async () => {
      const updatedClient = { id: 1, name: 'Updated Name', description: 'Old Desc' };

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 }); // Client exists
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, updatedClient);
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Client updated successfully');
      expect(response.body.client).toEqual(updatedClient);
    });

    test('should update client description', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1, name: 'Client', description: 'New Description' });
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ description: 'New Description' });

      expect(response.status).toBe(200);
    });

    test('should return 404 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .put('/api/clients/999')
        .send({ name: 'Updated' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app)
        .put('/api/clients/invalid')
        .send({ name: 'Updated' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should return 400 for empty update', async () => {
      const response = await request(app)
        .put('/api/clients/1')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /api/clients/:id', () => {
    test('should delete existing client', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Client deleted successfully' });
    });

    test('should return 404 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).delete('/api/clients/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('should return 400 for invalid client ID', async () => {
      const response = await request(app).delete('/api/clients/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should handle database delete error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Delete failed'));
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete client' });
    });

    test('should handle database error when checking client existence', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/clients - Error Handling', () => {
    test('should handle error retrieving client after creation', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Retrieval failed'), null);
      });

      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Test Client' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Client created but failed to retrieve' });
    });
  });

  describe('PUT /api/clients/:id - Error Handling', () => {
    test('should handle database error when checking client existence', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error during update', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update client' });
    });

    test('should handle error retrieving client after update', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(new Error('Retrieval failed'), null);
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Client updated but failed to retrieve' });
    });

    test('should update both name and description', async () => {
      const updatedClient = { id: 1, name: 'New Name', description: 'New Description' };

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, updatedClient);
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ name: 'New Name', description: 'New Description' });

      expect(response.status).toBe(200);
      expect(response.body.client).toEqual(updatedClient);
    });

    test('should update description to null when empty string provided', async () => {
      const updatedClient = { id: 1, name: 'Client', description: null };

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      mockDb.get.mockImplementationOnce((query, params, callback) => {
        callback(null, updatedClient);
      });

      const response = await request(app)
        .put('/api/clients/1')
        .send({ description: '' });

      expect(response.status).toBe(200);
    });
  });


  describe('PUT /api/clients/:id - partial updates', () => {
    const updatedRow = { id: 1, name: 'Client' };

    function mockExistingClient() {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, query.startsWith('SELECT id FROM') ? { id: 1 } : updatedRow);
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });
    }

    function expectUpdate(setClause, values) {
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        `UPDATE clients SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?`,
        [...values, 1, 'test@example.com'],
        expect.any(Function)
      );
    }

    test('should check the client exists for the current user', async () => {
      mockExistingClient();

      await request(app).put('/api/clients/1').send({ name: 'New' });

      expect(mockDb.get.mock.calls[0]).toEqual([
        'SELECT id FROM clients WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      ]);
    });

    test.each([
      ['name', '  New Name  ', 'New Name'],
      ['description', 'New Description', 'New Description'],
      ['department', 'Engineering', 'Engineering'],
      ['email', 'billing@client.com', 'billing@client.com']
    ])('should update only %s', async (field, input, stored) => {
      mockExistingClient();

      const response = await request(app).put('/api/clients/1').send({ [field]: input });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Client updated successfully', client: updatedRow });
      expectUpdate(`${field} = ?`, [stored]);
    });

    test.each(['description', 'department', 'email'])(
      'should store an empty %s as null',
      async (field) => {
        mockExistingClient();

        await request(app).put('/api/clients/1').send({ [field]: '' });

        expectUpdate(`${field} = ?`, [null]);
      }
    );

    test('should combine fields in a fixed order', async () => {
      mockExistingClient();

      await request(app)
        .put('/api/clients/1')
        .send({ email: 'a@b.co', department: 'Ops', description: 'D', name: 'N' });

      expectUpdate('name = ?, description = ?, department = ?, email = ?', ['N', 'D', 'Ops', 'a@b.co']);
    });

    test('should fetch the updated client by id', async () => {
      mockExistingClient();

      await request(app).put('/api/clients/1').send({ name: 'N' });

      expect(mockDb.get.mock.calls[1]).toEqual([
        'SELECT id, name, description, department, email, created_at, updated_at FROM clients WHERE id = ?',
        [1],
        expect.any(Function)
      ]);
    });
  });


  describe('Database contract and error logging', () => {
    const HEADERS = null;
    const cases = [
      {
        name: 'GET / logs and returns 500 when listing fails',
        method: 'get', url: '/api/clients', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['all', 'SELECT id, name, description, department, email, created_at, updated_at FROM clients WHERE user_email = ? ORDER BY name', ['test@example.com']]]
      },
      {
        name: 'GET /:id logs and returns 500 when lookup fails',
        method: 'get', url: '/api/clients/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id, name, description, department, email, created_at, updated_at FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'POST / stores empty optional fields as null',
        method: 'post', url: '/api/clients', body: { name: 'N', description: '', department: '', email: '' },
        failAt: 1, status: 500, error: 'Failed to create client', log: 'Database error:',
        calls: [['run', 'INSERT INTO clients (name, description, department, email, user_email) VALUES (?, ?, ?, ?, ?)', ['N', null, null, null, 'test@example.com']]]
      },
      {
        name: 'POST / inserts provided fields then fetches by lastID',
        method: 'post', url: '/api/clients', body: { name: 'N', description: 'D', department: 'Ops', email: 'a@b.co' },
        failAt: 2, status: 500, error: 'Client created but failed to retrieve', log: 'Database error:',
        calls: [
          ['run', 'INSERT INTO clients (name, description, department, email, user_email) VALUES (?, ?, ?, ?, ?)', ['N', 'D', 'Ops', 'a@b.co', 'test@example.com']],
          ['get', 'SELECT id, name, description, department, email, created_at, updated_at FROM clients WHERE id = ?', [5]]
        ]
      },
      {
        name: 'PUT /:id logs and returns 500 when ownership check fails',
        method: 'put', url: '/api/clients/3', body: { name: 'N' }, failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'PUT /:id logs and returns 500 when update fails',
        method: 'put', url: '/api/clients/3', body: { name: 'N' }, failAt: 2, status: 500, error: 'Failed to update client', log: 'Database error:',
        calls: [
          ['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']],
          ['run', 'UPDATE clients SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?', ['N', 3, 'test@example.com']]
        ]
      },
      {
        name: 'PUT /:id logs and returns 500 when re-fetch fails',
        method: 'put', url: '/api/clients/3', body: { name: 'N' }, failAt: 3, status: 500, error: 'Client updated but failed to retrieve', log: 'Database error:',
        calls: [
          ['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']],
          ['run', 'UPDATE clients SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?', ['N', 3, 'test@example.com']],
          ['get', 'SELECT id, name, description, department, email, created_at, updated_at FROM clients WHERE id = ?', [3]]
        ]
      },
      {
        name: 'DELETE / logs and returns 500 when bulk delete fails',
        method: 'delete', url: '/api/clients', failAt: 1, status: 500, error: 'Failed to delete clients', log: 'Database error:',
        calls: [['run', 'DELETE FROM clients WHERE user_email = ?', ['test@example.com']]]
      },
      {
        name: 'DELETE /:id logs and returns 500 when ownership check fails',
        method: 'delete', url: '/api/clients/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'DELETE /:id logs and returns 500 when delete fails',
        method: 'delete', url: '/api/clients/3', failAt: 2, status: 500, error: 'Failed to delete client', log: 'Database error:',
        calls: [
          ['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']],
          ['run', 'DELETE FROM clients WHERE id = ? AND user_email = ?', [3, 'test@example.com']]
        ]
      }
    ];

    let consoleErrorSpy;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    test.each(cases)('$name', async ({ method, url, body, failAt, rows, calls, status, error, log }) => {
      const dbError = new Error('Database error');
      const db = createSequentialDb({ failAt, error: dbError, rows });
      getDatabase.mockReturnValue(db);

      let req = request(app)[method](url);
      if (HEADERS) {
        req = req.set(HEADERS);
      }
      const response = await (body ? req.send(body) : req);

      expect(response.status).toBe(status);
      expect(response.body).toEqual({ error });
      expect(db.calls).toEqual(calls);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith(log, dbError);
    });

  });

  describe('DELETE /api/clients', () => {
    test('should delete all clients for the user and report the count', async () => {
      const db = createSequentialDb();
      getDatabase.mockReturnValue(db);

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 2 });
      expect(db.calls).toEqual([['run', 'DELETE FROM clients WHERE user_email = ?', ['test@example.com']]]);
    });
  });

  describe('Unexpected errors', () => {
    test.each([
      ['post', '/api/clients', { name: 'N' }],
      ['put', '/api/clients/1', { name: 'N' }]
    ])('%s %s forwards thrown errors to the error handler', async (method, url, body) => {
      getDatabase.mockImplementation(() => {
        throw new Error('boom');
      });

      const response = await request(app)[method](url).send(body);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
