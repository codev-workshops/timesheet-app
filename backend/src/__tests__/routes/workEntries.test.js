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

  describe('POST /api/work-entries - Weekly cap', () => {
    // 2024-01-17 is a Wednesday; its Mon–Sun week is 2024-01-15 .. 2024-01-21
    const weekStart = Date.UTC(2024, 0, 15);
    const weekEnd = Date.UTC(2024, 0, 22);

    const mockClientAndTotal = (cap, total) => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, { id: 1, weekly_hours_cap: cap });
        } else if (query.includes('SUM(hours)')) {
          callback(null, { total });
        } else {
          callback(null, { id: 1, client_id: 1, hours: 5, date: '2024-01-17', client_name: 'Client A' });
        }
      });
      mockDb.run.mockImplementation(function(query, params, callback) {
        this.lastID = 1;
        callback.call(this, null);
      });
    };

    test('should reject entry that pushes week total past the cap', async () => {
      mockClientAndTotal(40, 38);

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5, date: '2024-01-17' });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Weekly hours cap exceeded/);
      expect(response.body.error).toContain('43h');
      expect(response.body.error).toContain('cap 40h');
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should allow entry that exactly reaches the cap', async () => {
      mockClientAndTotal(40, 35);

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5, date: '2024-01-17' });

      expect(response.status).toBe(201);
    });

    test('should store the date as epoch milliseconds', async () => {
      mockClientAndTotal(40, 0);

      await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5, date: '2024-01-17' });

      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO work_entries'),
        [1, 'test@example.com', 5, null, Date.UTC(2024, 0, 17)],
        expect.any(Function)
      );
    });

    test('should query the Mon–Sun week containing the entry date, scoped to user and client', async () => {
      mockClientAndTotal(40, 0);

      await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5, date: '2024-01-17' });

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        ['test@example.com', 1, weekStart, weekEnd],
        expect.any(Function)
      );
    });

    test('should treat Sunday as the last day of the week', async () => {
      mockClientAndTotal(40, 0);

      await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5, date: '2024-01-21' });

      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        ['test@example.com', 1, weekStart, weekEnd],
        expect.any(Function)
      );
    });

    test('should skip the weekly total query when the client has no cap', async () => {
      mockClientAndTotal(null, 100);

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 24, date: '2024-01-17' });

      expect(response.status).toBe(201);
      expect(mockDb.get).not.toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        expect.anything(),
        expect.any(Function)
      );
    });

    test('should handle database error when summing weekly hours', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, { id: 1, weekly_hours_cap: 40 });
        } else {
          callback(new Error('Database error'), null);
        }
      });

      const response = await request(app)
        .post('/api/work-entries')
        .send({ clientId: 1, hours: 5, date: '2024-01-17' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Internal server error' });
    });
  });

  describe('PUT /api/work-entries/:id - Weekly cap', () => {
    const existingEntry = { id: 1, client_id: 1, hours: 8, date: Date.UTC(2024, 0, 17) };

    const mockUpdateScenario = (cap, totalExcludingSelf) => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, { id: 1, weekly_hours_cap: cap });
        } else if (query.includes('SUM(hours)')) {
          callback(null, { total: totalExcludingSelf });
        } else if (query.includes('work_entries we')) {
          callback(null, { ...existingEntry, client_name: 'Client A' });
        } else {
          callback(null, existingEntry);
        }
      });
      mockDb.run.mockImplementation((query, params, callback) => callback(null));
    };

    test('should reject raising hours past the cap', async () => {
      mockUpdateScenario(40, 32);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 10 });

      expect(response.status).toBe(400);
      expect(response.body.error).toMatch(/Weekly hours cap exceeded/);
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should exclude the entry itself from the weekly total', async () => {
      // Others (excluding this entry) total 30h; raising this entry 8h -> 9h gives 39h, within the 40h cap.
      // The SUM query must carry the `id != ?` exclusion so the entry's old 8h is not double-counted.
      mockUpdateScenario(40, 30);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 9 });

      expect(response.status).toBe(200);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('AND id != ?'),
        ['test@example.com', 1, Date.UTC(2024, 0, 15), Date.UTC(2024, 0, 22), 1],
        expect.any(Function)
      );
    });

    test('should allow reducing hours when the week is already over the cap', async () => {
      // Others total 45h against a 40h cap; shrinking this entry 8h -> 4h must still be allowed
      mockUpdateScenario(40, 45);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 4 });

      expect(response.status).toBe(200);
      expect(mockDb.get).not.toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        expect.anything(),
        expect.any(Function)
      );
    });

    test('should allow re-saving the same hours when the week is already over the cap', async () => {
      mockUpdateScenario(40, 45);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 8 });

      expect(response.status).toBe(200);
    });

    test('should not grant the reduce allowance when the entry moves to a different week', async () => {
      // Moving an 8h entry (reduced to 6h) into a week whose others already total 36h -> 42 > 40
      mockUpdateScenario(40, 36);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 6, date: '2024-01-24' });

      expect(response.status).toBe(400);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        ['test@example.com', 1, Date.UTC(2024, 0, 22), Date.UTC(2024, 0, 29), 1],
        expect.any(Function)
      );
    });

    test('should compose new hours and new date when both change', async () => {
      mockUpdateScenario(40, 30);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 10, date: '2024-01-24' });

      expect(response.status).toBe(200);
      expect(mockDb.get).toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        ['test@example.com', 1, Date.UTC(2024, 0, 22), Date.UTC(2024, 0, 29), 1],
        expect.any(Function)
      );
      expect(mockDb.run).toHaveBeenCalledWith(
        expect.stringContaining('date = ?'),
        expect.arrayContaining([Date.UTC(2024, 0, 24)]),
        expect.any(Function)
      );
    });

    test('should check the cap of the new client when reassigning', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          expect(params).toEqual([2, 'test@example.com']);
          callback(null, { id: 2, weekly_hours_cap: 5 });
        } else if (query.includes('SUM(hours)')) {
          expect(params[1]).toBe(2);
          callback(null, { total: 0 });
        } else {
          callback(null, existingEntry);
        }
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('cap 5h');
    });

    test('should skip the cap check when reassigning to a client with no cap', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, { id: 2, weekly_hours_cap: null });
        } else if (query.includes('work_entries we')) {
          callback(null, { ...existingEntry, client_id: 2, client_name: 'Client B' });
        } else {
          callback(null, existingEntry);
        }
      });
      mockDb.run.mockImplementation((query, params, callback) => callback(null));

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ clientId: 2 });

      expect(response.status).toBe(200);
      expect(mockDb.get).not.toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        expect.anything(),
        expect.any(Function)
      );
    });

    test('should return 400 when the entry\'s own client cannot be found', async () => {
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('FROM clients')) {
          callback(null, null);
        } else {
          callback(null, existingEntry);
        }
      });

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ hours: 2 });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ error: 'Client not found or does not belong to user' });
      expect(mockDb.run).not.toHaveBeenCalled();
    });

    test('should not check the cap for description-only updates', async () => {
      mockUpdateScenario(1, 100);

      const response = await request(app)
        .put('/api/work-entries/1')
        .send({ description: 'Just a note' });

      expect(response.status).toBe(200);
      expect(mockDb.get).not.toHaveBeenCalledWith(
        expect.stringContaining('SUM(hours)'),
        expect.anything(),
        expect.any(Function)
      );
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
      mockDb.get.mockImplementation((query, params, callback) => {
        if (query.includes('work_entries we')) {
          callback(new Error('Retrieval failed'), null);
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
});
