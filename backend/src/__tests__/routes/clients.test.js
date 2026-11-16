const request = require('supertest');
const express = require('express');
const clientRoutes = require('../../routes/clients');
const { getDatabase } = require('../../database/init');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = req.headers['x-test-user'] || 'test@example.com';
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

  describe('Shared column list (CLIENT_COLUMNS)', () => {
    const EXPECTED_COLUMNS = 'id, name, description, department, email, created_at, updated_at';

    test('GET / selects shared columns scoped by user_email and ordered by name', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ clients: [] });
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toBe(`SELECT ${EXPECTED_COLUMNS} FROM clients WHERE user_email = ? ORDER BY name`);
      expect(query).not.toMatch(/user_email,|\*/);
      expect(params).toEqual(['test@example.com']);
    });

    test('GET /:id selects shared columns scoped by id and user_email', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 7, name: 'X' }));

      const response = await request(app).get('/api/clients/7');

      expect(response.status).toBe(200);
      const [query, params] = mockDb.get.mock.calls[0];
      expect(query).toBe(`SELECT ${EXPECTED_COLUMNS} FROM clients WHERE id = ? AND user_email = ?`);
      expect(params).toEqual([7, 'test@example.com']);
    });

    test('POST / inserts all fields with user_email and re-selects shared columns by lastID', async () => {
      const created = {
        id: 42, name: 'Acme', description: 'D', department: 'Eng', email: 'acme@example.com',
        created_at: '2024-01-01', updated_at: '2024-01-01'
      };
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 42 }, null);
      });
      mockDb.get.mockImplementation((query, params, callback) => callback(null, created));

      const response = await request(app)
        .post('/api/clients')
        .send({ name: '  Acme  ', description: 'D', department: 'Eng', email: 'acme@example.com' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Client created successfully', client: created });
      const [insertQuery, insertParams] = mockDb.run.mock.calls[0];
      expect(insertQuery).toBe('INSERT INTO clients (name, description, department, email, user_email) VALUES (?, ?, ?, ?, ?)');
      expect(insertParams).toEqual(['Acme', 'D', 'Eng', 'acme@example.com', 'test@example.com']);
      const [selectQuery, selectParams] = mockDb.get.mock.calls[0];
      expect(selectQuery).toBe(`SELECT ${EXPECTED_COLUMNS} FROM clients WHERE id = ?`);
      expect(selectParams).toEqual([42]);
    });

    test('POST / stores empty optional fields as null', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ lastID: 1 }, null);
      });
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1, name: 'Only' }));

      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Only', description: '', department: '', email: '' });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1]).toEqual(['Only', null, null, null, 'test@example.com']);
    });

    test('PUT /:id updates department and email, scoped by user_email, and re-selects shared columns', async () => {
      const updated = { id: 3, name: 'C', department: 'Ops', email: 'ops@example.com' };
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(null, updated));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/clients/3')
        .send({ department: 'Ops', email: 'ops@example.com' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Client updated successfully', client: updated });
      expect(mockDb.get.mock.calls[0][0]).toBe('SELECT id FROM clients WHERE id = ? AND user_email = ?');
      expect(mockDb.get.mock.calls[0][1]).toEqual([3, 'test@example.com']);
      const [updateQuery, updateParams] = mockDb.run.mock.calls[0];
      expect(updateQuery).toBe(
        'UPDATE clients SET department = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?'
      );
      expect(updateParams).toEqual(['Ops', 'ops@example.com', 3, 'test@example.com']);
      expect(mockDb.get.mock.calls[1][0]).toBe(`SELECT ${EXPECTED_COLUMNS} FROM clients WHERE id = ?`);
      expect(mockDb.get.mock.calls[1][1]).toEqual([3]);
    });

    test('PUT /:id clears department and email to null when empty strings provided', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/clients/3')
        .send({ department: '', email: '' });

      expect(response.status).toBe(200);
      expect(mockDb.run.mock.calls[0][1]).toEqual([null, null, 3, 'test@example.com']);
    });
  });

  describe('Validation errors', () => {
    test('POST / returns 400 for invalid email', async () => {
      const response = await request(app).post('/api/clients').send({ name: 'A', email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('POST / returns 400 for unknown field', async () => {
      const response = await request(app).post('/api/clients').send({ name: 'A', user_email: 'other@example.com' });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('POST / returns 400 for name longer than 255 chars', async () => {
      const response = await request(app).post('/api/clients').send({ name: 'a'.repeat(256) });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('PUT /:id returns 400 for invalid email without touching the DB', async () => {
      const response = await request(app).put('/api/clients/1').send({ email: 'bad' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('Unexpected errors are forwarded to the error handler', () => {
    test('POST / forwards synchronous errors via next()', async () => {
      getDatabase.mockImplementation(() => { throw new Error('boom'); });

      const response = await request(app).post('/api/clients').send({ name: 'A' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      getDatabase.mockReset();
    });

    test('PUT /:id forwards synchronous errors via next()', async () => {
      getDatabase.mockImplementation(() => { throw new Error('boom'); });

      const response = await request(app).put('/api/clients/1').send({ name: 'A' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
      getDatabase.mockReset();
    });
  });

  describe('DELETE /api/clients (all for user)', () => {
    test('deletes only the authenticated user\'s clients and returns the count', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        callback.call({ changes: 3 }, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 3 });
      expect(mockDb.run.mock.calls[0][0]).toBe('DELETE FROM clients WHERE user_email = ?');
      expect(mockDb.run.mock.calls[0][1]).toEqual(['test@example.com']);
    });

    test('returns 500 when the delete fails', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('fail')));

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete clients' });
    });
  });

  describe('Per-user isolation (two users)', () => {
    const ALICE = 'alice@example.com';
    const BOB = 'bob@example.com';
    let rows;

    beforeEach(() => {
      rows = [
        { id: 1, name: 'Alice Co', description: null, department: null, email: null, user_email: ALICE },
        { id: 2, name: 'Bob Co', description: null, department: null, email: null, user_email: BOB }
      ];
      const strip = ({ user_email, ...rest }) => rest;
      mockDb.all.mockImplementation((query, [userEmail], callback) => {
        callback(null, rows.filter(r => r.user_email === userEmail).map(strip));
      });
      mockDb.get.mockImplementation((query, params, callback) => {
        const [id, userEmail] = params;
        const row = rows.find(r => r.id === id && (userEmail === undefined || r.user_email === userEmail));
        callback(null, row ? strip(row) : undefined);
      });
      mockDb.run.mockImplementation(function(query, params, callback) {
        const id = params[params.length - 2];
        const userEmail = params[params.length - 1];
        const before = rows.length;
        if (query.startsWith('DELETE')) {
          rows = rows.filter(r => !(r.id === id && r.user_email === userEmail));
        }
        callback.call({ changes: before - rows.length }, null);
      });
    });

    test('GET / lists only the requesting user\'s clients', async () => {
      const alice = await request(app).get('/api/clients').set('x-test-user', ALICE);
      const bob = await request(app).get('/api/clients').set('x-test-user', BOB);

      expect(alice.body.clients.map(c => c.name)).toEqual(['Alice Co']);
      expect(bob.body.clients.map(c => c.name)).toEqual(['Bob Co']);
      expect(alice.body.clients[0]).not.toHaveProperty('user_email');
    });

    test('GET /:id returns 404 for another user\'s client', async () => {
      const response = await request(app).get('/api/clients/2').set('x-test-user', ALICE);

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Client not found' });
    });

    test('PUT /:id returns 404 for another user\'s client and does not update', async () => {
      const response = await request(app).put('/api/clients/2').set('x-test-user', ALICE).send({ name: 'Hijack' });

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('DELETE /:id returns 404 for another user\'s client and leaves it intact', async () => {
      const response = await request(app).delete('/api/clients/2').set('x-test-user', ALICE);

      expect(response.status).toBe(404);
      expect(rows.map(r => r.id)).toEqual([1, 2]);
    });

    test('DELETE /:id by the owner removes only that client', async () => {
      const response = await request(app).delete('/api/clients/2').set('x-test-user', BOB);

      expect(response.status).toBe(200);
      expect(rows.map(r => r.id)).toEqual([1]);
    });
  });
});
