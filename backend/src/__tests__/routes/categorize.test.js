const request = require('supertest');
const express = require('express');
const { getDatabase } = require('../../database/init');
const llmService = require('../../services/llmService');
const workEntryRoutes = require('../../routes/workEntries');

jest.mock('../../database/init');
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req, res, next) => {
    req.userEmail = req.headers['x-user-email'] || 'test@example.com';
    next();
  }
}));
jest.mock('../../services/llmService', () => ({
  ...jest.requireActual('../../services/llmService'),
  categorizeEntry: jest.fn()
}));

const app = express();
app.use(express.json());
app.use('/api/entries', workEntryRoutes);

const mockEntry = {
  id: 1,
  client_id: 1,
  hours: 2,
  description: 'Fixed login bug and wrote tests',
  date: '2024-01-01',
  client_name: 'Client A'
};

describe('POST /api/entries/:id/categorize', () => {
  let mockDb;
  let userCounter = 0;
  const uniqueUser = () => `user${++userCounter}@example.com`;

  beforeEach(() => {
    mockDb = {
      all: jest.fn(),
      get: jest.fn((query, params, callback) => callback(null, mockEntry)),
      run: jest.fn()
    };
    getDatabase.mockReturnValue(mockDb);
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('should return category, summary and source from the LLM service', async () => {
    llmService.categorizeEntry.mockResolvedValue({
      category: 'development',
      summary: 'Fixed login bug',
      source: 'llm'
    });
    const user = uniqueUser();

    const response = await request(app)
      .post('/api/entries/1/categorize')
      .set('x-user-email', user);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ category: 'development', summary: 'Fixed login bug', source: 'llm' });
    expect(mockDb.get).toHaveBeenCalledWith(
      expect.stringContaining('JOIN clients c ON we.client_id = c.id'),
      [1, user],
      expect.any(Function)
    );
    expect(llmService.categorizeEntry).toHaveBeenCalledWith({
      description: mockEntry.description,
      clientName: mockEntry.client_name,
      hours: mockEntry.hours,
      date: mockEntry.date
    });
  });

  test('should return fallback when the LLM service throws', async () => {
    llmService.categorizeEntry.mockRejectedValue(new Error('LLM down'));

    const response = await request(app)
      .post('/api/entries/1/categorize')
      .set('x-user-email', uniqueUser());

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      category: 'other',
      summary: mockEntry.description,
      source: 'fallback'
    });
  });

  test('should return 400 for invalid work entry ID', async () => {
    const response = await request(app)
      .post('/api/entries/invalid/categorize')
      .set('x-user-email', uniqueUser());

    expect(response.status).toBe(400);
    expect(response.body).toEqual({ error: 'Invalid work entry ID' });
    expect(llmService.categorizeEntry).not.toHaveBeenCalled();
  });

  test('should return 404 if work entry not found', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(null, undefined));

    const response = await request(app)
      .post('/api/entries/999/categorize')
      .set('x-user-email', uniqueUser());

    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Work entry not found' });
    expect(llmService.categorizeEntry).not.toHaveBeenCalled();
  });

  test('should return 500 on database error', async () => {
    mockDb.get.mockImplementation((query, params, callback) => callback(new Error('db'), null));

    const response = await request(app)
      .post('/api/entries/1/categorize')
      .set('x-user-email', uniqueUser());

    expect(response.status).toBe(500);
    expect(response.body).toEqual({ error: 'Internal server error' });
  });

  test('should return 429 after 10 requests per minute for the same user', async () => {
    llmService.categorizeEntry.mockResolvedValue({ category: 'other', summary: 's', source: 'llm' });
    const user = uniqueUser();

    for (let i = 0; i < 10; i++) {
      const ok = await request(app).post('/api/entries/1/categorize').set('x-user-email', user);
      expect(ok.status).toBe(200);
    }

    const limited = await request(app).post('/api/entries/1/categorize').set('x-user-email', user);
    expect(limited.status).toBe(429);
    expect(limited.body).toEqual({ error: expect.stringContaining('Too many categorization requests') });

    const otherUser = await request(app).post('/api/entries/1/categorize').set('x-user-email', uniqueUser());
    expect(otherUser.status).toBe(200);
  });
});
