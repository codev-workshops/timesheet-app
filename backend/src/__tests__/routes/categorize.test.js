const request = require('supertest');
const express = require('express');
const workEntryRoutes = require('../../routes/workEntries');
const { getDatabase } = require('../../database/init');
const { categorizeEntry, CategorizationError } = require('../../services/categorization');

jest.mock('../../database/init');
jest.mock('../../services/categorization', () => {
  class CategorizationError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }
  return { categorizeEntry: jest.fn(), CategorizationError };
});
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = 'test@example.com';
    next();
  }
}));

const app = express();
app.use(express.json());
app.use('/api/work-entries', workEntryRoutes);

const entryRow = {
  id: 1,
  client_id: 1,
  hours: 4,
  description: 'Fixed login bug in auth service',
  category: null,
  date: '2024-01-01',
  client_name: 'Acme',
  client_department: 'Engineering'
};

describe('POST /api/work-entries/:id/categorize', () => {
  let mockDb;

  beforeEach(() => {
    mockDb = { all: jest.fn(), get: jest.fn(), run: jest.fn() };
    getDatabase.mockReturnValue(mockDb);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('classifies the entry, persists the category and returns the updated entry', async () => {
    categorizeEntry.mockResolvedValue('Development');

    mockDb.get
      .mockImplementationOnce((query, params, callback) => {
        expect(params).toEqual([1, 'test@example.com']);
        callback(null, entryRow);
      })
      .mockImplementationOnce((query, params, callback) => {
        callback(null, { ...entryRow, category: 'Development' });
      });
    mockDb.run.mockImplementation((query, params, callback) => {
      expect(query).toContain('UPDATE work_entries SET category = ?');
      expect(params).toEqual(['Development', 1, 'test@example.com']);
      callback.call({ changes: 1 }, null);
    });

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(200);
    expect(response.body.workEntry.category).toBe('Development');
    expect(categorizeEntry).toHaveBeenCalledWith({
      description: 'Fixed login bug in auth service',
      clientName: 'Acme',
      department: 'Engineering'
    });
  });

  test('returns 400 for an invalid work entry ID', async () => {
    const response = await request(app).post('/api/work-entries/abc/categorize');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid work entry ID' });
    expect(categorizeEntry).not.toHaveBeenCalled();
  });

  test('returns 404 when the entry does not belong to the user', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, null));

    const response = await request(app).post('/api/work-entries/99/categorize');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Work entry not found' });
    expect(categorizeEntry).not.toHaveBeenCalled();
  });

  test('returns 500 when the lookup query fails', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('DB error')));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  test('returns 502 when the LLM response is malformed or empty', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, entryRow));
    categorizeEntry.mockRejectedValue(new CategorizationError('Model returned an unrecognized category', 502));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'Model returned an unrecognized category' });
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  test('returns 504 when the LLM request times out', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, entryRow));
    categorizeEntry.mockRejectedValue(new CategorizationError('Categorization request timed out', 504));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(504);
    expect(response.body).toEqual({ error: 'Categorization request timed out' });
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  test('returns 429 when the LLM provider rate-limits the request', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, entryRow));
    categorizeEntry.mockRejectedValue(new CategorizationError('Categorization rate limited', 429));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({ error: 'Categorization rate limited' });
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  test('returns 502 for unexpected errors without a status', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, entryRow));
    categorizeEntry.mockRejectedValue(new Error('boom'));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(502);
    expect(response.body).toEqual({ error: 'boom' });
  });

  test('returns 500 when persisting the category fails', async () => {
    categorizeEntry.mockResolvedValue('Meetings');
    mockDb.get.mockImplementation((query, params, callback) => callback(null, entryRow));
    mockDb.run.mockImplementation((query, params, callback) => callback(new Error('DB error')));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Failed to save category' });
  });

  test('returns 500 when re-fetching the entry after update fails', async () => {
    categorizeEntry.mockResolvedValue('Meetings');
    mockDb.get
      .mockImplementationOnce((query, params, callback) => callback(null, entryRow))
      .mockImplementationOnce((query, params, callback) => callback(new Error('DB error')));
    mockDb.run.mockImplementation((query, params, callback) => callback(null));

    const response = await request(app).post('/api/work-entries/1/categorize');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Category saved but failed to retrieve work entry' });
  });
});
