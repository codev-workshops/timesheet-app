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
      all: jest.fn((query, params, callback) => callback(null, [])),
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
      expect(response.body).toEqual({
        workEntries: mockEntries.map((entry) => ({ ...entry, categories: [] }))
      });
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
      expect(response.body).toEqual({ workEntry: { ...mockEntry, categories: [] } });
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

  describe('Work entry categories', () => {
    test('GET list attaches categories and gives untagged entries an empty array', async () => {
      const entries = [
        { id: 1, client_id: 1, client_name: 'Client A' },
        { id: 2, client_id: 1, client_name: 'Client A' }
      ];
      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('work_entry_categories')) {
          callback(null, [
            { work_entry_id: 1, id: 8, name: 'Alpha' },
            { work_entry_id: 1, id: 9, name: 'Zulu' }
          ]);
        } else {
          callback(null, entries);
        }
      });

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      expect(response.body.workEntries).toEqual([
        { ...entries[0], categories: [{ id: 8, name: 'Alpha' }, { id: 9, name: 'Zulu' }] },
        { ...entries[1], categories: [] }
      ]);
      expect(mockDb.all).toHaveBeenCalledTimes(2);
      expect(mockDb.all.mock.calls[1][1]).toEqual(['test@example.com', 'test@example.com']);
    });

    test('GET empty list skips the category query', async () => {
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ workEntries: [] });
      expect(mockDb.all).toHaveBeenCalledTimes(1);
    });

    test('GET client-filtered list scopes the category query to the client', async () => {
      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('work_entry_categories')) {
          callback(null, []);
        } else {
          callback(null, [{ id: 1, client_id: 4 }]);
        }
      });

      const response = await request(app).get('/api/work-entries?clientId=4');

      expect(response.status).toBe(200);
      expect(mockDb.all.mock.calls[1][0]).toContain('AND we.client_id = ?');
      expect(mockDb.all.mock.calls[1][1]).toEqual(['test@example.com', 'test@example.com', 4]);
    });

    test('GET list returns 500 when attaching categories fails', async () => {
      mockDb.all
        .mockImplementationOnce((query, params, callback) => callback(null, [{ id: 1 }]))
        .mockImplementationOnce((query, params, callback) => callback(new Error('category query failed')));

      const response = await request(app).get('/api/work-entries');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });

    test('GET single attaches categories with a work entry scoped query', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1, client_name: 'Client A' }));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, [{ work_entry_id: 1, id: 3, name: 'Planning' }]));

      const response = await request(app).get('/api/work-entries/1');

      expect(response.status).toBe(200);
      expect(response.body.workEntry.categories).toEqual([{ id: 3, name: 'Planning' }]);
      expect(mockDb.all.mock.calls[0][0]).toContain('WHERE wec.work_entry_id = ? AND we.user_email = ? AND c.user_email = ?');
      expect(mockDb.all.mock.calls[0][1]).toEqual([1, 'test@example.com', 'test@example.com']);
    });

    test('POST verifies categories, inserts associations, and returns categories', async () => {
      const categoryIds = [2, 3];
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10, client_name: 'Client A' }));
      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM categories WHERE user_email')) {
          callback(null, [{ id: 2 }, { id: 3 }]);
        } else {
          callback(null, [
            { work_entry_id: 10, id: 2, name: 'Design' },
            { work_entry_id: 10, id: 3, name: 'Build' }
          ]);
        }
      });
      mockDb.run
        .mockImplementationOnce(function(query, params, callback) {
          this.lastID = 10;
          callback.call(this, null);
        })
        .mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).post('/api/work-entries').send({
        clientId: 1,
        hours: 5,
        date: '2024-01-15',
        categoryIds
      });

      expect(response.status).toBe(201);
      expect(response.body.workEntry.categories).toEqual([
        { id: 2, name: 'Design' },
        { id: 3, name: 'Build' }
      ]);
      expect(mockDb.all.mock.calls[0][0]).toContain('SELECT id FROM categories WHERE user_email = ? AND id IN (?, ?)');
      expect(mockDb.all.mock.calls[0][1]).toEqual(['test@example.com', 2, 3]);
      expect(mockDb.run.mock.calls[2][0]).toContain('INSERT INTO work_entry_categories');
      expect(mockDb.run.mock.calls[2][0]).toContain('SELECT ?, id FROM categories WHERE user_email = ?');
      expect(mockDb.run.mock.calls[2][1]).toEqual([10, 'test@example.com', 2, 3]);
      expect(mockDb.get.mock.calls[1][0]).toContain('WHERE we.id = ? AND we.user_email = ?');
      expect(mockDb.get.mock.calls[1][1]).toEqual([10, 'test@example.com']);
    });

    test('POST rejects missing or foreign category IDs before inserting an entry', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, [{ id: 5 }]));

      const response = await request(app).post('/api/work-entries').send({
        clientId: 1,
        hours: 5,
        date: '2024-01-15',
        categoryIds: [5, 6]
      });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'One or more categories not found or do not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO work_entries'),
        expect.anything(),
        expect.any(Function)
      );
    });

    test('POST returns 500 when category verification fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 1 }));
      mockDb.all.mockImplementation((query, params, callback) => callback(new Error('verify failed')));

      const response = await request(app).post('/api/work-entries').send({
        clientId: 1,
        hours: 5,
        date: '2024-01-15',
        categoryIds: [1]
      });

      expect(response.status).toBe(500);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('POST returns 500 when category replacement fails', async () => {
      mockDb.get.mockImplementationOnce((query, params, callback) => callback(null, { id: 1 }));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, [{ id: 2 }]));
      mockDb.run
        .mockImplementationOnce(function(query, params, callback) {
          this.lastID = 10;
          callback.call(this, null);
        })
        .mockImplementationOnce((query, params, callback) => callback(new Error('replace failed')));

      const response = await request(app).post('/api/work-entries').send({
        clientId: 1,
        hours: 5,
        date: '2024-01-15',
        categoryIds: [2]
      });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to assign categories' });
    });

    test('PUT replaces category associations after verifying ownership', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }));
      mockDb.all.mockImplementation((query, params, callback) => {
        if (query.includes('SELECT id FROM categories WHERE user_email')) {
          callback(null, [{ id: 2 }]);
        } else {
          callback(null, [{ work_entry_id: 10, id: 2, name: 'Planning' }]);
        }
      });
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/work-entries/10').send({ categoryIds: [2] });

      expect(response.status).toBe(200);
      expect(response.body.workEntry.categories).toEqual([{ id: 2, name: 'Planning' }]);
      expect(mockDb.all.mock.calls[0][1]).toEqual(['test@example.com', 2]);
      expect(mockDb.run.mock.calls[1][0]).toContain('DELETE FROM work_entry_categories');
      expect(mockDb.run.mock.calls[2][0]).toContain('INSERT INTO work_entry_categories');
      expect(mockDb.run.mock.calls[2][1]).toEqual([10, 'test@example.com', 2]);
    });

    test('PUT with an empty category array clears associations without inserting', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/work-entries/10').send({ categoryIds: [] });

      expect(response.status).toBe(200);
      expect(mockDb.run.mock.calls[1][0]).toContain('DELETE FROM work_entry_categories');
      expect(mockDb.run.mock.calls.some(([query]) => query.includes('INSERT INTO work_entry_categories'))).toBe(false);
    });

    test('PUT without category IDs does not update the junction table', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app).put('/api/work-entries/10').send({ hours: 8 });

      expect(response.status).toBe(200);
      expect(mockDb.run).toHaveBeenCalledTimes(1);
      expect(mockDb.run.mock.calls[0][0]).not.toContain('work_entry_categories');
    });

    test('PUT rejects foreign category IDs before writing', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 10 }));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, []));

      const response = await request(app).put('/api/work-entries/10').send({ categoryIds: [99] });

      expect(response.status).toBe(400);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('PUT returns 500 when category verification fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 10 }));
      mockDb.all.mockImplementation((query, params, callback) => callback(new Error('verify failed')));

      const response = await request(app).put('/api/work-entries/10').send({ categoryIds: [1] });

      expect(response.status).toBe(500);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('PUT returns 500 when replacing categories fails', async () => {
      mockDb.get.mockImplementation((query, params, callback) => callback(null, { id: 10 }));
      mockDb.all.mockImplementation((query, params, callback) => callback(null, [{ id: 1 }]));
      mockDb.run
        .mockImplementationOnce((query, params, callback) => callback(null))
        .mockImplementationOnce((query, params, callback) => callback(new Error('replace failed')));

      const response = await request(app).put('/api/work-entries/10').send({ categoryIds: [1] });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to assign categories' });
    });

    test('PUT returns 500 when attaching categories to the response fails', async () => {
      mockDb.get
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }))
        .mockImplementationOnce((query, params, callback) => callback(null, { id: 10 }));
      mockDb.run.mockImplementation((query, params, callback) => callback(null));
      mockDb.all.mockImplementation((query, params, callback) => callback(new Error('attach failed')));

      const response = await request(app).put('/api/work-entries/10').send({ hours: 8 });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });
});
