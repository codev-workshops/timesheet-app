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

  describe('POST /api/clients - department and email fields', () => {
    const setupInsert = (created) => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 5;
        callback.call(this, null);
      });
      mockDb.get.mockImplementation((query, params, callback) => callback(null, created));
    };

    test('persists department and email when provided', async () => {
      const payload = { name: 'Acme', department: 'Finance', email: 'ap@acme.com' };
      const created = { id: 5, description: null, ...payload };
      setupInsert(created);

      const response = await request(app).post('/api/clients').send(payload);

      expect(response.status).toBe(201);
      expect(response.body.client).toEqual(created);
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO clients (name, description, department, email, user_email)'),
        ['Acme', null, 'Finance', 'ap@acme.com', 'test@example.com'],
        expect.any(Function)
      );
    });

    test('stores empty department/email as NULL', async () => {
      setupInsert({ id: 5, name: 'Acme' });

      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Acme', department: '', email: '' });

      expect(response.status).toBe(201);
      expect(mockDb.run.mock.calls[0][1]).toEqual(['Acme', null, null, null, 'test@example.com']);
    });

    test('rejects malformed client email with 400 and does not insert', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Acme', email: 'not-an-email' });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('rejects department longer than 255 characters', async () => {
      const response = await request(app)
        .post('/api/clients')
        .send({ name: 'Acme', department: 'd'.repeat(256) });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/clients/:id - department and email fields', () => {
    beforeEach(() => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) =>
          callback(null, { id: 1, name: 'Acme', department: 'Ops', email: 'ops@acme.com' })
        );
      mockDb.run.mockImplementation((query, params, callback) => callback(null));
    });

    test('updates department and email only', async () => {
      const response = await request(app)
        .put('/api/clients/1')
        .send({ department: 'Ops', email: 'ops@acme.com' });

      expect(response.status).toBe(200);
      expect(mockDb.run).toHaveBeenCalledWith(
        'UPDATE clients SET department = ?, email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?',
        ['Ops', 'ops@acme.com', 1, 'test@example.com'],
        expect.any(Function)
      );
    });

    test('clears department and email when empty strings are sent', async () => {
      const response = await request(app)
        .put('/api/clients/1')
        .send({ department: '', email: '' });

      expect(response.status).toBe(200);
      expect(mockDb.run.mock.calls[0][1]).toEqual([null, null, 1, 'test@example.com']);
    });
  });

  describe('DELETE /api/clients (bulk delete for user)', () => {
    test('deletes all clients for the authenticated user and reports count', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.changes = 3;
        callback.call(this, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'All clients deleted successfully', deletedCount: 3 });
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM clients WHERE user_email = ?',
        ['test@example.com'],
        expect.any(Function)
      );
    });

    test('returns deletedCount 0 when the user has no clients', async () => {
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.changes = 0;
        callback.call(this, null);
      });

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(200);
      expect(response.body.deletedCount).toBe(0);
    });

    test('returns 500 when the bulk delete fails', async () => {
      mockDb.run.mockImplementation((query, params, callback) => callback(new Error('boom')));

      const response = await request(app).delete('/api/clients');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete clients' });
    });
  });

  describe('Cross-user isolation for mutations', () => {
    test('PUT on another user\'s client returns 404 and issues no UPDATE', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

      const response = await request(app).put('/api/clients/1').send({ name: 'Hijack' });

      expect(response.status).toBe(404);
      expect(mockDb.get).toHaveBeenCalledWith(
        'SELECT id FROM clients WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      );
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('DELETE on another user\'s client returns 404 and issues no DELETE', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

      const response = await request(app).delete('/api/clients/1');

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('single DELETE statement is scoped by id AND user_email (cascade handled by FK)', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      await request(app).delete('/api/clients/1');

      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        'DELETE FROM clients WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      );
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
});
