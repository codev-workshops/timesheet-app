const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
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
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO work_entries'),
        [newEntry.clientId, 'test@example.com', newEntry.hours, newEntry.description, newEntry.date],
        expect.any(Function)
      );
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
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE work_entries SET date = ?'),
        ['2024-02-01', 1, 'test@example.com'],
        expect.any(Function)
      );
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

  describe('Tenant isolation', () => {
    test('should scope the list query to the authenticated user', async () => {
      mockDb.all.mockImplementationOnce((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workEntries: [] });
      const [query, params] = mockDb.all.mock.calls[0];
      expect(query).toContain('WHERE we.user_email = ?');
      expect(query).not.toContain('we.client_id = ?');
      expect(params).toEqual(['test@example.com']);
    });

    test('should scope the single-entry query to the authenticated user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).get('/api/work-entries/5');

      expect(response.status).toBe(404);
      expect(mockDb.get.mock.calls[0][0]).toContain('WHERE we.id = ? AND we.user_email = ?');
      expect(mockDb.get.mock.calls[0][1]).toEqual([5, 'test@example.com']);
    });

    test('should verify the client, insert and re-read the entry for the authenticated user', async () => {
      const created = { id: 42, client_id: 3, hours: 2, description: null, date: '2024-01-15', client_name: 'Acme' };
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 3 }))
        .mockImplementationOnce((query, params, callback) => callback(null, created));
      mockDb.run.mockImplementationOnce(function(query, params, callback) {
        callback.call({ lastID: 42 }, null);
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 3, hours: 2, date: '2024-01-15' });

      expect(response.status).toBe(201);
      expect(response.body).toEqual({ message: 'Work entry created successfully', workEntry: created });
      expect(mockDb.get.mock.calls[0][0]).toBe('SELECT id FROM clients WHERE id = ? AND user_email = ?');
      expect(mockDb.get.mock.calls[0][1]).toEqual([3, 'test@example.com']);
      expect(mockDb.run.mock.calls[0][1]).toEqual([3, 'test@example.com', 2, null, '2024-01-15']);
      expect(mockDb.get.mock.calls[1][1]).toEqual([42, 'test@example.com']);
    });

    test('should not insert when the client belongs to another user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 9, hours: 2, date: '2024-01-15' });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.get.mock.calls[0][1]).toEqual([9, 'test@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should check entry and new client ownership before updating', async () => {
      const updated = { id: 1, client_id: 2, hours: 4, client_name: 'Beta' };
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 2 }))
        .mockImplementationOnce((query, params, callback) => callback(null, updated));
      mockDb.run.mockImplementationOnce((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 2, hours: 4 });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: 'Work entry updated successfully', workEntry: updated });
      expect(mockDb.get.mock.calls[0][1]).toEqual([1, 'test@example.com']);
      expect(mockDb.get.mock.calls[1][0]).toBe('SELECT id FROM clients WHERE id = ? AND user_email = ?');
      expect(mockDb.get.mock.calls[1][1]).toEqual([2, 'test@example.com']);
      const [query, params] = mockDb.run.mock.calls[0];
      expect(query).toBe('UPDATE work_entries SET client_id = ?, hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_email = ?');
      expect(params).toEqual([2, 4, 1, 'test@example.com']);
      expect(mockDb.get.mock.calls[2][1]).toEqual([1, 'test@example.com']);
    });

    test('should not update when moving the entry to another user\'s client', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 9 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.get.mock.calls[1][1]).toEqual([9, 'test@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should not update an entry that belongs to another user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app)
        .put('/api/work-entries/6')
        .send({ hours: 2 });

      expect(response.status).toBe(404);
      expect(mockDb.get.mock.calls[0][1]).toEqual([6, 'test@example.com']);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should scope the delete to the authenticated user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, { id: 4 }));
      mockDb.run.mockImplementationOnce((query, params, callback) => callback(null));

      const response = await request(app).delete('/api/work-entries/4');

      expect(response.status).toBe(200);
      expect(mockDb.get.mock.calls[0][1]).toEqual([4, 'test@example.com']);
      expect(mockDb.run.mock.calls[0][0]).toBe('DELETE FROM work_entries WHERE id = ? AND user_email = ?');
      expect(mockDb.run.mock.calls[0][1]).toEqual([4, 'test@example.com']);
    });

    test('should not delete an entry that belongs to another user', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, undefined));

      const response = await request(app).delete('/api/work-entries/4');

      expect(response.status).toBe(404);
      expect(mockDb.run).not.toHaveBeenCalled();
    });
  });

  describe('Validation errors', () => {
    test.each([
      ['missing hours', { clientId: 1, date: '2024-01-15' }],
      ['non-numeric hours', { clientId: 1, hours: 'abc', date: '2024-01-15' }],
      ['zero hours', { clientId: 1, hours: 0, date: '2024-01-15' }],
      ['missing date', { clientId: 1, hours: 2 }],
      ['invalid date', { clientId: 1, hours: 2, date: 'not-a-date' }],
      ['impossible calendar date', { clientId: 1, hours: 2, date: '2024-13-01' }],
      ['missing client', { hours: 2, date: '2024-01-15' }],
      ['non-numeric client', { clientId: 'abc', hours: 2, date: '2024-01-15' }]
    ])('should return 400 on create for %s without touching the database', async (label, body) => {
      const response = await request(app).post('/api/work-entries').send(body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
      expect(mockDb.get).not.toHaveBeenCalled();
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test.each([
      ['non-numeric hours', { hours: 'abc' }],
      ['negative hours', { hours: -1 }],
      ['hours over 24', { hours: 24.5 }],
      ['invalid date', { date: '2024-02-30' }]
    ])('should return 400 on update for %s without touching the database', async (label, body) => {
      const response = await request(app).put('/api/work-entries/1').send(body);

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Validation error' });
      expect(mockDb.get).not.toHaveBeenCalled();
    });
  });

  describe('Unexpected errors', () => {
    test('should pass synchronous errors on create to the error handler', async () => {
      getDatabase.mockImplementation(() => { throw new Error('Database unavailable'); });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 2, date: '2024-01-15' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('should pass synchronous errors on update to the error handler', async () => {
      getDatabase.mockImplementation(() => { throw new Error('Database unavailable'); });

      const response = await request(app).put('/api/work-entries/1').send({ hours: 2 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
