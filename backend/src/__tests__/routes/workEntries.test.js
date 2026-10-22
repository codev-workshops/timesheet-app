const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
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
app.use('/api/work-entries', workEntryRoutes);
// Add error handler for Joi validation
app.use((err, req, res, next) => {
  if (err.isJoi) {
    return res.status(400).json({ error: 'Validation error' });
  }
  res.status(500).json({ error: 'Internal server error' });
});

describe('Work Entry Routes', () => {
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

  describe('GET /api/work-entries', () => {
    test('should return all work entries for user', async () => {
      const mockEntries = [
        { id: 1, client_id: 1, hours: 5, description: 'Work 1', date: '2024-01-01', client_name: 'Client A' },
        { id: 2, client_id: 2, hours: 3, description: 'Work 2', date: '2024-01-02', client_name: 'Client B' }
      ];

      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, mockEntries);
      });

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workEntries: mockEntries });
    });

    test('should filter by client ID when provided', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        expect(params).toEqual(['test@example.com', 1]);
        callback(null, []);
      });

      await request(app).get('/api/work-entries?clientId=1');

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('AND we.client_id = ?'),
        ['test@example.com', 1],
        expect.any(Function)
      );
    });

    test('should return 400 for invalid client ID filter', async () => {
      const response = await request(app).get('/api/work-entries?clientId=invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
    });

    test('should handle database error', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/work-entries/:id', () => {
    test('should return specific work entry', async () => {
      const mockEntry = { id: 1, client_id: 1, hours: 5, description: 'Work', client_name: 'Client A' };

      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, mockEntry);
      });

      const response = await request(app).get('/api/work-entries/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workEntry: mockEntry });
    });

    test('should return 404 if work entry not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).get('/api/work-entries/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Work entry not found' });
    });

    test('should return 400 for invalid work entry ID', async () => {
      const response = await request(app).get('/api/work-entries/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid work entry ID' });
    });
  });

  describe('POST /api/work-entries', () => {
    test('should create work entry with valid data', async () => {
      const newEntry = {
        clientId: 1,
        hours: 5.5,
        description: 'Development work',
        date: '2024-01-15'
      };

      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('clients')) {
          callback(null, { id: 1 }); // Client exists
        } else {
          callback(null, { id: 1, ...newEntry, client_name: 'Client A' });
        }
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send(newEntry);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Work entry created successfully');
    });

    test('should return 400 if client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null); // Client doesn't exist
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 999,
          hours: 5,
          date: '2024-01-15'
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
    });

    test('should return 400 for missing required fields', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({ hours: 5 });

      expect(response.status).toBe(400);
    });

    test('should return 400 for invalid hours', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 1,
          hours: -5,
          date: '2024-01-15'
        });

      expect(response.status).toBe(400);
    });

    test('should return 400 for hours exceeding 24', async () => {
      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 1,
          hours: 25,
          date: '2024-01-15'
        });

      expect(response.status).toBe(400);
    });

    test('should handle database error on insert', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Insert failed'));
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 1,
          hours: 5,
          date: '2024-01-15'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to create work entry' });
    });
  });

  describe('PUT /api/work-entries/:id', () => {
    test('should update work entry hours', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries we')) {
          callback(null, { id: 1, hours: 8, client_name: 'Client A' });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 8 });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Work entry updated successfully');
    });

    test('should update work entry client', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(200);
    });

    test('should return 404 if work entry not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app)
        .put('/api/work-entries/999')
        .send({ hours: 8 });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Work entry not found' });
    });

    test('should return 400 for invalid work entry ID', async () => {
      const response = await request(app)
        .put('/api/work-entries/invalid')
        .send({ hours: 8 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid work entry ID' });
    });

    test('should return 400 for empty update', async () => {
      const response = await request(app)
        .put('/api/work-entries/1')
        .send({});

      expect(response.status).toBe(400);
    });

    test('should return 400 if new client not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries')) {
          callback(null, { id: 1 });
        } else {
          callback(null, null); // Client doesn't exist
        }
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 999 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
    });
  });

  describe('DELETE /api/work-entries/:id', () => {
    test('should delete existing work entry', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app).delete('/api/work-entries/1');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Work entry deleted successfully' });
    });

    test('should return 404 if work entry not found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, null);
      });

      const response = await request(app).delete('/api/work-entries/999');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({ error: 'Work entry not found' });
    });

    test('should return 400 for invalid work entry ID', async () => {
      const response = await request(app).delete('/api/work-entries/invalid');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid work entry ID' });
    });

    test('should handle database delete error', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Delete failed'));
      });

      const response = await request(app).delete('/api/work-entries/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to delete work entry' });
    });

    test('should handle database error when checking work entry existence', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).delete('/api/work-entries/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('GET /api/work-entries/:id - Error Handling', () => {
    test('should handle database error when fetching single work entry', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app).get('/api/work-entries/1');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('POST /api/work-entries - Error Handling', () => {
    test('should handle database error when verifying client', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 1,
          hours: 5,
          date: '2024-01-15'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle error retrieving work entry after creation', async () => {
      let getCallCount = 0;
      mockDb.get.mockImplementation((query, params, callback) => {
        getCallCount++;
        if (getCallCount === 1) {
          callback(null, { id: 1 });
        } else {
          callback(new Error('Retrieval failed'), null);
        }
      });

      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({
          clientId: 1,
          hours: 5,
          date: '2024-01-15'
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Work entry created but failed to retrieve' });
    });
  });

  describe('PUT /api/work-entries/:id - Error Handling', () => {
    test('should handle database error when checking work entry existence', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(new Error('Database error'), null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 8 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error when verifying new client in update', async () => {
      let callCount = 0;
      mockDb.get.mockImplementation((query, params, callback) => {
        callCount++;
        if (callCount === 1) {
          callback(null, { id: 1 });
        } else {
          callback(new Error('Database error'), null);
        }
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should handle database error during update', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        callback(null, { id: 1 });
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(new Error('Update failed'));
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 8 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to update work entry' });
    });

    test('should handle error retrieving work entry after update', async () => {
      let getCallCount = 0;
      mockDb.get.mockImplementation((query, params, callback) => {
        getCallCount++;
        if (getCallCount === 1) {
          callback(null, { id: 1 });
        } else {
          callback(new Error('Retrieval failed'), null);
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 8 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Work entry updated but failed to retrieve' });
    });

    test('should update work entry date', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries we')) {
          callback(null, { id: 1, date: '2024-02-01', client_name: 'Client A' });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ date: '2024-02-01' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Work entry updated successfully');
    });

    test('should update work entry description', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries we')) {
          callback(null, { id: 1, description: 'New description', client_name: 'Client A' });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ description: 'New description' });

      expect(response.status).toBe(200);
    });

    test('should update description to null when empty string provided', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries we')) {
          callback(null, { id: 1, description: null, client_name: 'Client A' });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ description: '' });

      expect(response.status).toBe(200);
    });

    test('should update multiple fields at once', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries we')) {
          callback(null, { id: 1, hours: 10, description: 'Updated', date: '2024-03-01', client_name: 'Client A' });
        } else {
          callback(null, { id: 1 });
        }
      });

      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 10, description: 'Updated', date: '2024-03-01' });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Work entry updated successfully');
    });
  });


  describe('GET /api/work-entries - clientId filter guard', () => {
    test('should not filter by client when clientId is absent', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).not.toContain('AND we.client_id = ?');
      expect(query).toMatch(/WHERE we\.user_email = \?\s+ORDER BY we\.date DESC, we\.created_at DESC$/);
      expect(params).toEqual(['test@example.com']);
    });

    test('should not filter by client when clientId is empty', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/work-entries?clientId=');

      expect(response.status).toBe(200);
      expect(mockDb.all.mock.calls[0][1]).toEqual(['test@example.com']);
    });

    test('should add parsed clientId filter to the query', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        callback(null, []);
      });

      const response = await request(app).get('/api/work-entries?clientId=42');

      expect(response.status).toBe(200);
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toMatch(/WHERE we\.user_email = \?\s+AND we\.client_id = \? ORDER BY we\.date DESC, we\.created_at DESC$/);
      expect(params).toEqual(['test@example.com', 42]);
    });

    test('should reject non-numeric clientId without querying', async () => {
      const response = await request(app).get('/api/work-entries?clientId=abc');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Invalid client ID' });
      expect(mockDb.all).not.toHaveBeenCalled();
    });
  });

  describe('PUT /api/work-entries/:id - partial updates', () => {
    const updatedRow = { id: 1, client_id: 1, hours: 8, client_name: 'Client A' };

    function mockExistingEntry({ clientRow = { id: 2 } } = {}) {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM work_entries we')) {
          callback(null, updatedRow);
        } else if (query.includes('FROM clients')) {
          callback(null, clientRow);
        } else {
          callback(null, { id: 1 });
        }
      });
      mockDb.run.mockImplementation((query, params, callback) => {
        callback(null);
      });
    }

    function expectUpdate(setClause, values) {
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run).toHaveBeenCalledWith(
        `UPDATE work_entries SET ${setClause}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?`,
        [...values, 1, 'test@example.com'],
        expect.any(Function)
      );
    }

    function clientLookupCalls() {
      return mockDb.get.mock.calls.filter(([query]) => query.includes('FROM clients'));
    }

    test('should verify ownership of a new clientId and update it', async () => {
      mockExistingEntry();

      const response = await request(app).put('/api/work-entries/1').send({ clientId: 2 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Work entry updated successfully', workEntry: updatedRow });
      expect(clientLookupCalls()).toEqual([
        ['SELECT id FROM clients WHERE id = ? AND user_email = ?', [2, 'test@example.com'], expect.any(Function)]
      ]);
      expectUpdate('client_id = ?', [2]);
    });

    test('should reject a foreign/nonexistent clientId without updating', async () => {
      mockExistingEntry({ clientRow: null });

      const response = await request(app).put('/api/work-entries/1').send({ clientId: 999 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(clientLookupCalls()[0][1]).toEqual([999, 'test@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should check the entry exists for the current user', async () => {
      mockExistingEntry();

      await request(app).put('/api/work-entries/1').send({ hours: 4 });

      expect(mockDb.get.mock.calls[0]).toEqual([
        'SELECT id FROM work_entries WHERE id = ? AND user_email = ?',
        [1, 'test@example.com'],
        expect.any(Function)
      ]);
    });

    test('should update only hours', async () => {
      mockExistingEntry();

      const response = await request(app).put('/api/work-entries/1').send({ hours: 4.5 });

      expect(response.status).toBe(200);
      expect(clientLookupCalls()).toHaveLength(0);
      expectUpdate('hours = ?', [4.5]);
    });

    test('should update only description', async () => {
      mockExistingEntry();

      const response = await request(app).put('/api/work-entries/1').send({ description: '  Refactor  ' });

      expect(response.status).toBe(200);
      expect(clientLookupCalls()).toHaveLength(0);
      expectUpdate('description = ?', ['Refactor']);
    });

    test('should store an empty description as null', async () => {
      mockExistingEntry();

      await request(app).put('/api/work-entries/1').send({ description: '' });

      expectUpdate('description = ?', [null]);
    });

    test('should update only date', async () => {
      mockExistingEntry();

      const response = await request(app).put('/api/work-entries/1').send({ date: '2024-02-01' });

      expect(response.status).toBe(200);
      expect(clientLookupCalls()).toHaveLength(0);
      expectUpdate('date = ?', [new Date('2024-02-01')]);
    });

    test('should combine fields in a fixed order', async () => {
      mockExistingEntry();

      await request(app)
        .put('/api/work-entries/1')
        .send({ date: '2024-02-01', description: 'x', hours: 2, clientId: 2 });

      expectUpdate('client_id = ?, hours = ?, description = ?, date = ?', [2, 2, 'x', new Date('2024-02-01')]);
    });

    test('should fetch the updated entry by id after updating', async () => {
      mockExistingEntry();

      await request(app).put('/api/work-entries/1').send({ hours: 4 });

      const lastGet = mockDb.get.mock.calls[mockDb.get.mock.calls.length - 1];
      expect(lastGet[0]).toMatch(/FROM work_entries we\s+JOIN clients c ON we\.client_id = c\.id\s+WHERE we\.id = \?$/);
      expect(lastGet[1]).toEqual([1]);
    });
  });


  describe('Database contract and error logging', () => {
    const HEADERS = null;
    const cases = [
      {
        name: 'GET / logs and returns 500 when listing fails',
        method: 'get', url: '/api/work-entries', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['all', expect.stringMatching(/^\s*SELECT we\.id, we\.client_id, we\.hours, we\.description, we\.date,\s+we\.created_at, we\.updated_at, c\.name as client_name\s+FROM work_entries we\s+JOIN clients c ON we\.client_id = c\.id\s+WHERE we\.user_email = \?\s+ORDER BY we\.date DESC, we\.created_at DESC$/), ['test@example.com']]]
      },
      {
        name: 'GET /:id logs and returns 500 when lookup fails',
        method: 'get', url: '/api/work-entries/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', expect.stringMatching(/^SELECT we\.id, we\.client_id, we\.hours, we\.description, we\.date,\s+we\.created_at, we\.updated_at, c\.name as client_name\s+FROM work_entries we\s+JOIN clients c ON we\.client_id = c\.id\s+WHERE we\.id = \? AND we\.user_email = \?$/), [3, 'test@example.com']]]
      },
      {
        name: 'POST / logs and returns 500 when client check fails',
        method: 'post', url: '/api/work-entries', body: { clientId: 1, hours: 2, date: '2024-01-01' },
        failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [1, 'test@example.com']]]
      },
      {
        name: 'POST / stores an empty description as null',
        method: 'post', url: '/api/work-entries', body: { clientId: 1, hours: 2, description: '', date: '2024-01-01' },
        failAt: 2, status: 500, error: 'Failed to create work entry', log: 'Database error:',
        calls: [['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [1, 'test@example.com']], ['run', 'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)', [1, 'test@example.com', 2, null, new Date('2024-01-01')]]]
      },
      {
        name: 'POST / inserts the description then fetches by lastID',
        method: 'post', url: '/api/work-entries', body: { clientId: 1, hours: 2, description: 'D', date: '2024-01-01' },
        failAt: 3, status: 500, error: 'Work entry created but failed to retrieve', log: 'Database error:',
        calls: [['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [1, 'test@example.com']], ['run', 'INSERT INTO work_entries (client_id, user_email, hours, description, date) VALUES (?, ?, ?, ?, ?)', [1, 'test@example.com', 2, 'D', new Date('2024-01-01')]], ['get', expect.stringMatching(/^SELECT we\.id, we\.client_id, we\.hours, we\.description, we\.date,\s+we\.created_at, we\.updated_at, c\.name as client_name\s+FROM work_entries we\s+JOIN clients c ON we\.client_id = c\.id\s+WHERE we\.id = \?$/), [5]]]
      },
      {
        name: 'PUT /:id logs and returns 500 when ownership check fails',
        method: 'put', url: '/api/work-entries/3', body: { clientId: 2 }, failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'PUT /:id logs and returns 500 when new client check fails',
        method: 'put', url: '/api/work-entries/3', body: { clientId: 2 }, failAt: 2, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [2, 'test@example.com']]]
      },
      {
        name: 'PUT /:id logs and returns 500 when update fails',
        method: 'put', url: '/api/work-entries/3', body: { clientId: 2 }, failAt: 3, status: 500, error: 'Failed to update work entry', log: 'Database error:',
        calls: [['get', 'SELECT id FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [2, 'test@example.com']], ['run', 'UPDATE work_entries SET client_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?', [2, 3, 'test@example.com']]]
      },
      {
        name: 'PUT /:id logs and returns 500 when re-fetch fails',
        method: 'put', url: '/api/work-entries/3', body: { clientId: 2 }, failAt: 4, status: 500, error: 'Work entry updated but failed to retrieve', log: 'Database error:',
        calls: [['get', 'SELECT id FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['get', 'SELECT id FROM clients WHERE id = ? AND user_email = ?', [2, 'test@example.com']], ['run', 'UPDATE work_entries SET client_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?', [2, 3, 'test@example.com']], ['get', expect.stringMatching(/^SELECT we\.id, we\.client_id, we\.hours, we\.description, we\.date,\s+we\.created_at, we\.updated_at, c\.name as client_name\s+FROM work_entries we\s+JOIN clients c ON we\.client_id = c\.id\s+WHERE we\.id = \?$/), [3]]]
      },
      {
        name: 'DELETE /:id logs and returns 500 when ownership check fails',
        method: 'delete', url: '/api/work-entries/3', failAt: 1, status: 500, error: 'Internal server error', log: 'Database error:',
        calls: [['get', 'SELECT id FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
      },
      {
        name: 'DELETE /:id logs and returns 500 when delete fails',
        method: 'delete', url: '/api/work-entries/3', failAt: 2, status: 500, error: 'Failed to delete work entry', log: 'Database error:',
        calls: [['get', 'SELECT id FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']], ['run', 'DELETE FROM work_entries WHERE id = ? AND user_email = ?', [3, 'test@example.com']]]
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

  describe('Unexpected errors', () => {
    test.each([
      ['post', '/api/work-entries', { clientId: 1, hours: 2, date: '2024-01-01' }],
      ['put', '/api/work-entries/1', { hours: 2 }]
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
